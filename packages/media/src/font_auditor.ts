import fs from 'node:fs';

export interface FontAuditResult {
  font_family: string;
  has_cyrillic_chars: boolean;
  supported: boolean;
  recommended_fallback: string;
  /**
   * License text read from the font file's OpenType "name" table (IDs 13/14),
   * or "unverified" when no font file was inspected or it carries no license record.
   */
  license_status: string;
  /** How Cyrillic support was determined: read from the font's cmap, a known-family list, or not at all. */
  coverage_source: 'cmap' | 'known_family' | 'unverified';
  warnings: string[];
}

interface SfntInfo {
  /** Returns true if the font maps the given code point to a non-zero glyph. */
  hasCodePoint: (cp: number) => boolean;
  license?: string;
  licenseUrl?: string;
}

/** Representative Bulgarian/Russian letters; all must be present for Cyrillic coverage. */
const CYRILLIC_SAMPLE = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЬЮЯабвгдежзийклмнопрстуфхцчшщъьюя';

export class FontAuditor {
  private static readonly KNOWN_CYRILLIC_FONTS = new Set([
    'geist',
    'inter',
    'roboto',
    'arial',
    'helvetica',
    '-apple-system',
    'blinkmacsystemfont',
    'sans-serif',
    'system-ui'
  ]);

  static readonly KNOWN_LATIN_ONLY_FONTS = new Set([
    'cinzel',
    'copperplate',
    'futura-latin',
    'impact-latin'
  ]);

  /**
   * Tests whether a string contains Cyrillic Unicode block characters (U+0400 - U+04FF).
   */
  static containsCyrillic(text: string): boolean {
    return /[Ѐ-ӿ]/.test(text);
  }

  /**
   * Audits a font selection against copy requirements, ensuring Cyrillic texts do not render tofu characters.
   * When a font file is given, glyph coverage and license are read from the file itself.
   */
  static auditFontCoverage(
    text: string,
    fontFamily: string,
    fontFilePath?: string
  ): FontAuditResult {
    const hasCyrillic = this.containsCyrillic(text);
    // Match whole family names from a CSS font stack, not substrings ("inter" must not match "Interstate").
    const families = fontFamily
      .split(',')
      .map(f => f.trim().replace(/^["']|["']$/g, '').toLowerCase())
      .filter(Boolean);
    const primary = families[0] ?? '';
    const warnings: string[] = [];
    let supported = true;
    let license = 'unverified';
    let coverageSource: FontAuditResult['coverage_source'] = 'unverified';

    let sfnt: SfntInfo | undefined;
    if (fontFilePath) {
      if (!fs.existsSync(fontFilePath)) {
        warnings.push(`Specified font file not found on disk: ${fontFilePath}`);
        supported = false;
      } else {
        try {
          sfnt = this.readSfnt(fs.readFileSync(fontFilePath));
          if (sfnt.license || sfnt.licenseUrl) {
            license = [sfnt.license, sfnt.licenseUrl].filter(Boolean).join(' | ');
          } else {
            warnings.push(`Font file ${fontFilePath} has no license record (name IDs 13/14); license is unverified.`);
          }
        } catch (err) {
          warnings.push(`Could not parse font file ${fontFilePath}: ${(err as Error).message}`);
          supported = false;
        }
      }
    }

    if (hasCyrillic) {
      if (sfnt) {
        coverageSource = 'cmap';
        const needed = new Set([...CYRILLIC_SAMPLE, ...text].filter(ch => this.containsCyrillic(ch)));
        const missing = [...needed].filter(ch => !sfnt!.hasCodePoint(ch.codePointAt(0)!));
        if (missing.length > 0) {
          supported = false;
          warnings.push(`Font file is missing Cyrillic glyphs: ${missing.join('')}. Copy will render tofu boxes.`);
        }
      } else if (supported) {
        const isLatinOnly = this.KNOWN_LATIN_ONLY_FONTS.has(primary);
        const isKnownCyrillic = this.KNOWN_CYRILLIC_FONTS.has(primary);
        if (isLatinOnly) {
          coverageSource = 'known_family';
          supported = false;
          warnings.push(
            `Font "${fontFamily}" does not provide Cyrillic glyph coverage (U+0400-U+04FF). Bulgarian copy will render square tofu boxes.`
          );
        } else if (isKnownCyrillic) {
          coverageSource = 'known_family';
        } else {
          warnings.push(
            `Font "${fontFamily}" is unverified for Cyrillic glyph support. Recommend bundling Geist (OFL-1.1) to avoid fallback rendering artifacts.`
          );
        }
      }
    }

    return {
      font_family: fontFamily,
      has_cyrillic_chars: hasCyrillic,
      supported,
      recommended_fallback: 'Geist, sans-serif',
      license_status: license,
      coverage_source: coverageSource,
      warnings
    };
  }

  /**
   * Minimal OpenType/TrueType reader: table directory, "cmap" (formats 4 and 12) and "name" (IDs 13/14).
   * Font collections (.ttc) use the first font. WOFF/WOFF2 are not supported.
   */
  private static readSfnt(buf: Buffer): SfntInfo {
    let base = 0;
    const tag = buf.toString('latin1', 0, 4);
    if (tag === 'ttcf') base = buf.readUInt32BE(12);
    else if (tag === 'wOFF' || tag === 'wOF2') throw new Error('WOFF/WOFF2 fonts are not supported; provide the TTF/OTF file');

    const numTables = buf.readUInt16BE(base + 4);
    const tables = new Map<string, { offset: number; length: number }>();
    for (let i = 0; i < numTables; i++) {
      const rec = base + 12 + i * 16;
      tables.set(buf.toString('latin1', rec, rec + 4), { offset: buf.readUInt32BE(rec + 8), length: buf.readUInt32BE(rec + 12) });
    }

    const cmap = tables.get('cmap');
    if (!cmap) throw new Error('font has no cmap table');
    const hasCodePoint = this.buildCmapLookup(buf, cmap.offset);

    const info: SfntInfo = { hasCodePoint };
    const name = tables.get('name');
    if (name) {
      const count = buf.readUInt16BE(name.offset + 2);
      const strOffset = name.offset + buf.readUInt16BE(name.offset + 4);
      for (let i = 0; i < count; i++) {
        const r = name.offset + 6 + i * 12;
        const platformId = buf.readUInt16BE(r);
        const nameId = buf.readUInt16BE(r + 6);
        if (nameId !== 13 && nameId !== 14) continue;
        const len = buf.readUInt16BE(r + 8);
        const off = strOffset + buf.readUInt16BE(r + 10);
        const raw = buf.subarray(off, off + len);
        // Platform 3 (Windows) and 0 (Unicode) strings are UTF-16BE; platform 1 (Mac) is single-byte.
        const value = platformId === 1 ? raw.toString('latin1') : Buffer.from(raw).swap16().toString('utf16le');
        if (nameId === 13 && !info.license) info.license = value.trim();
        if (nameId === 14 && !info.licenseUrl) info.licenseUrl = value.trim();
      }
    }
    return info;
  }

  private static buildCmapLookup(buf: Buffer, cmapOffset: number): (cp: number) => boolean {
    const numSub = buf.readUInt16BE(cmapOffset + 2);
    let fmt4: number | undefined;
    let fmt12: number | undefined;
    for (let i = 0; i < numSub; i++) {
      const rec = cmapOffset + 4 + i * 8;
      const platformId = buf.readUInt16BE(rec);
      const encodingId = buf.readUInt16BE(rec + 2);
      const sub = cmapOffset + buf.readUInt32BE(rec + 4);
      const format = buf.readUInt16BE(sub);
      const unicode = platformId === 0 || (platformId === 3 && (encodingId === 1 || encodingId === 10));
      if (!unicode) continue;
      if (format === 12 && fmt12 === undefined) fmt12 = sub;
      if (format === 4 && fmt4 === undefined) fmt4 = sub;
    }

    if (fmt12 !== undefined) {
      const sub = fmt12;
      const nGroups = buf.readUInt32BE(sub + 12);
      return (cp: number) => {
        for (let g = 0; g < nGroups; g++) {
          const r = sub + 16 + g * 12;
          const start = buf.readUInt32BE(r);
          const end = buf.readUInt32BE(r + 4);
          if (cp >= start && cp <= end) return buf.readUInt32BE(r + 8) + (cp - start) !== 0;
        }
        return false;
      };
    }
    if (fmt4 !== undefined) {
      const sub = fmt4;
      const segX2 = buf.readUInt16BE(sub + 6);
      const endCodes = sub + 14;
      const startCodes = endCodes + segX2 + 2;
      const idDeltas = startCodes + segX2;
      const idRangeOffsets = idDeltas + segX2;
      return (cp: number) => {
        if (cp > 0xffff) return false;
        for (let s = 0; s < segX2 / 2; s++) {
          const end = buf.readUInt16BE(endCodes + s * 2);
          if (cp > end) continue;
          const start = buf.readUInt16BE(startCodes + s * 2);
          if (cp < start) return false;
          const delta = buf.readInt16BE(idDeltas + s * 2);
          const rangeOffPos = idRangeOffsets + s * 2;
          const rangeOff = buf.readUInt16BE(rangeOffPos);
          if (rangeOff === 0) return ((cp + delta) & 0xffff) !== 0;
          const glyph = buf.readUInt16BE(rangeOffPos + rangeOff + (cp - start) * 2);
          return glyph !== 0 && ((glyph + delta) & 0xffff) !== 0;
        }
        return false;
      };
    }
    throw new Error('font has no Unicode cmap subtable (format 4 or 12)');
  }
}
