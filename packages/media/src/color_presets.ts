import { runFfmpeg, probe } from './proc.js';
import { ColorSpaceConfigurator } from './colorspace.js';
import path from 'node:path';
import fs from 'node:fs';

export type ColorPresetName =
  | 'cool-tech'
  | 'warm-vibrant'
  | 'high-contrast'
  | 'rec709-neutral'
  | 'matte-film';

export interface ColorPresetConfig {
  name: ColorPresetName;
  description: string;
  targetGenre: string;
  filterString: string;
}

export const COLOR_PRESETS: Record<ColorPresetName, ColorPresetConfig> = {
  'cool-tech': {
    name: 'cool-tech',
    description: 'Crisp cool blue bias and clean contrast tailored for SaaS product demos and modern UI',
    targetGenre: 'SaaS / Tech Demos',
    filterString: 'eq=contrast=1.10:saturation=0.95:gamma=1.02,colorbalance=rs=-0.04:bs=0.06:rm=-0.02:bm=0.05'
  },
  'warm-vibrant': {
    name: 'warm-vibrant',
    description: 'Rich saturation and warm tone highlights for commercial promos and consumer retail',
    targetGenre: 'Promos / Commercials',
    filterString: 'eq=contrast=1.12:saturation=1.20:gamma=0.98,colorbalance=rs=0.06:bs=-0.03:rm=0.04:bm=-0.02'
  },
  'high-contrast': {
    name: 'high-contrast',
    description: 'Deep punchy blacks and energetic highlights for high-conversion multi-SKU retail ads',
    targetGenre: 'E-Commerce / Social Ads',
    filterString: 'eq=contrast=1.22:brightness=-0.02:saturation=1.12'
  },
  'rec709-neutral': {
    name: 'rec709-neutral',
    description: 'Standard ITU-R BT.709-6 studio broadcast baseline with true 1:1 color accuracy',
    targetGenre: 'Broadcast / Neutral',
    filterString: 'eq=contrast=1.0:brightness=0.0:saturation=1.0'
  },
  'matte-film': {
    name: 'matte-film',
    description: 'Lifted cinematic shadows and subdued saturation for documentary and interview footage',
    targetGenre: 'Talking-Head / Documentary',
    filterString: 'eq=contrast=0.94:brightness=0.03:saturation=0.90,colorbalance=gs=0.02:gm=0.01'
  }
};

export interface ApplyGradeOptions {
  outputPath?: string;
}

export interface ApplyGradeResult {
  inputPath: string;
  outputPath: string;
  preset: ColorPresetConfig;
}

export class ColorPresetEngine {
  static listPresets(): ColorPresetConfig[] {
    return Object.values(COLOR_PRESETS);
  }

  static getPreset(presetName: ColorPresetName): ColorPresetConfig {
    const p = COLOR_PRESETS[presetName];
    if (!p) {
      throw new Error(`Color preset not found: ${presetName}. Available: ${Object.keys(COLOR_PRESETS).join(', ')}`);
    }
    return p;
  }

  static applyGrade(inputPath: string, presetName: ColorPresetName, options: ApplyGradeOptions = {}): ApplyGradeResult {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input video not found: ${inputPath}`);
    }

    const preset = this.getPreset(presetName);
    const outPath = options.outputPath ?? path.join(
      path.dirname(inputPath),
      `${path.basename(inputPath, path.extname(inputPath))}-graded-${presetName}.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Convert (not just tag) the source into BT.709 limited range so the output tags are true.
    const conversion = this.buildRec709Conversion(inputPath);
    // setparams stamps the frame color properties; recent ffmpeg versions take frame
    // properties over the encoder -color_* options, so tagging must happen in the graph too.
    const tag = 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv';
    const vf = [preset.filterString, conversion, tag].filter(Boolean).join(',');

    runFfmpeg([
      '-i', inputPath,
      '-vf', vf,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p',
      ...ColorSpaceConfigurator.getRec709Flags(),
      '-c:a', 'copy',
      outPath
    ]);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate graded video at: ${outPath}`);
    }

    return {
      inputPath,
      outputPath: outPath,
      preset
    };
  }

  /**
   * Builds a scale filter that converts the source matrix/range to BT.709 limited range.
   * Untagged sources are assumed BT.601 below 720 lines and BT.709 otherwise (common practice).
   * Returns null when the source is already BT.709 limited range.
   */
  private static buildRec709Conversion(inputPath: string): string | null {
    const info = probe(inputPath);
    const streams = (info.raw.streams as Array<Record<string, unknown>> | undefined) ?? [];
    const v = streams.find(s => s.codec_type === 'video') ?? {};
    const space = String(v.color_space ?? 'unknown');
    const range = String(v.color_range ?? 'unknown');
    const matrixMap: Record<string, string> = {
      bt709: 'bt709', smpte170m: 'bt601', bt470bg: 'bt601', bt601: 'bt601',
      smpte240m: 'smpte240m', bt2020nc: 'bt2020', bt2020c: 'bt2020', fcc: 'fcc'
    };
    const inMatrix = matrixMap[space] ?? (info.height >= 720 ? 'bt709' : 'bt601');
    const inRange = range === 'pc' ? 'full' : 'tv';
    if (inMatrix === 'bt709' && inRange === 'tv') return null;
    return `scale=in_color_matrix=${inMatrix}:out_color_matrix=bt709:in_range=${inRange}:out_range=tv`;
  }
}
