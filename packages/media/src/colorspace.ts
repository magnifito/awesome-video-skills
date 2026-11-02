import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ColorSpaceMetadata {
  color_space?: string;
  color_primaries?: string;
  color_transfer?: string;
  color_range?: string;
  is_rec709_compliant: boolean;
}

export class ColorSpaceConfigurator {
  /**
   * Generates FFmpeg CLI arguments to guarantee Rec.709 / BT.709 broadcast & web color tagging.
   */
  static getRec709Flags(): string[] {
    return [
      '-colorspace', 'bt709',
      '-color_primaries', 'bt709',
      '-color_trc', 'bt709',
      '-color_range', 'tv'
    ];
  }

  /**
   * Inspects color metadata on an encoded video stream.
   */
  static async inspectColorMetadata(filePath: string): Promise<ColorSpaceMetadata> {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      filePath
    ];

    try {
      const { stdout } = await execFileAsync('ffprobe', args);
      const probe = JSON.parse(stdout);
      const videoStream = probe.streams?.find((s: Record<string, unknown>) => s.codec_type === 'video');

      const colorSpace = videoStream?.color_space as string | undefined;
      const primaries = videoStream?.color_primaries as string | undefined;
      const transfer = videoStream?.color_transfer as string | undefined;
      const range = videoStream?.color_range as string | undefined;

      const isCompliant =
        (colorSpace === 'bt709' || colorSpace === 'unspecified' || !colorSpace) &&
        (primaries === 'bt709' || primaries === 'unspecified' || !primaries) &&
        (transfer === 'bt709' || transfer === 'iec61966-2-1' || transfer === 'unspecified' || !transfer);

      return {
        color_space: colorSpace,
        color_primaries: primaries,
        color_transfer: transfer,
        color_range: range,
        is_rec709_compliant: isCompliant
      };
    } catch (error) {
      throw new Error(`Failed to inspect color metadata for ${filePath}: ${(error as Error).message}`);
    }
  }
}
