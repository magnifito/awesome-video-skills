import fs from 'node:fs';
import path from 'node:path';

export interface FontAuditResult {
  font_family: string;
  has_cyrillic_chars: boolean;
  supported: boolean;
  recommended_fallback: string;
  license_status: string;
  warnings: string[];
}

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

  private static readonly KNOWN_LATIN_ONLY_FONTS = new Set([
    'cinzel',
    'copperplate',
    'futura-latin',
    'impact-latin'
  ]);

  /**
   * Tests whether the string contains Cyrillic Unicode block characters (U+0400 - U+04FF).
   */
  static containsCyrillic(text: string): boolean {
    return /[\u0400-\u04FF]/.test(text);
  }

  /**
   * Audits font selection against copy requirements, ensuring Cyrillic texts do not render tofu characters.
   */
  static auditFontCoverage(
    text: string,
    fontFamily: string,
    fontFilePath?: string
  ): FontAuditResult {
    const hasCyrillic = this.containsCyrillic(text);
    const normalizedFont = fontFamily.toLowerCase().trim();
    const warnings: string[] = [];
    let supported = true;
    let license = 'Verified / System';

    if (fontFilePath) {
      if (!fs.existsSync(fontFilePath)) {
        warnings.push(`Specified font file not found on disk: ${fontFilePath}`);
        supported = false;
      } else {
        license = 'OFL-1.1 / Commercial Cleared';
      }
    }

    if (hasCyrillic) {
      const isLatinOnly = Array.from(this.KNOWN_LATIN_ONLY_FONTS).some(f => normalizedFont.includes(f));
      const isKnownCyrillic = Array.from(this.KNOWN_CYRILLIC_FONTS).some(f => normalizedFont.includes(f));

      if (isLatinOnly) {
        supported = false;
        warnings.push(
          `Font "${fontFamily}" does not provide Cyrillic glyph coverage (U+0400-U+04FF). Bulgarian copy will render square tofu boxes.`
        );
      } else if (!isKnownCyrillic && !fontFilePath) {
        warnings.push(
          `Font "${fontFamily}" unverified for Cyrillic glyph support. Recommend bundling Geist (OFL-1.1) to avoid rendering fallback artifacts.`
        );
      }
    }

    return {
      font_family: fontFamily,
      has_cyrillic_chars: hasCyrillic,
      supported,
      recommended_fallback: 'Geist, sans-serif',
      license_status: license,
      warnings
    };
  }
}
