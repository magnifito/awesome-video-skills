/**
 * Timeline utilities enforcing Section 7 requirements:
 * "Represent output frame rate as a rational numerator/denominator,
 * and edited ranges as integer, half-open frame intervals [start, end).
 * Store source presentation times in integer microseconds and audio
 * positions in integer samples with the sample rate recorded."
 */

export interface RationalRate {
  numerator: number;
  denominator: number;
}

export interface FrameRange {
  start_frame: number; // inclusive
  end_frame: number;   // exclusive: [start, end)
}

export class TimelineMapper {
  private fpsNumerator: number;
  private fpsDenominator: number;
  private sampleRate: number;

  constructor(fps: RationalRate = { numerator: 30, denominator: 1 }, sampleRate = 48000) {
    if (!Number.isInteger(fps.numerator) || !Number.isInteger(fps.denominator) || fps.numerator <= 0 || fps.denominator <= 0) {
      throw new Error(`Frame rate must be a positive integer rational, got ${fps.numerator}/${fps.denominator}`);
    }
    if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
      throw new Error(`Sample rate must be a positive integer, got ${sampleRate}`);
    }
    this.fpsNumerator = fps.numerator;
    this.fpsDenominator = fps.denominator;
    this.sampleRate = sampleRate;
  }

  get fps(): number {
    return this.fpsNumerator / this.fpsDenominator;
  }

  /**
   * Convert seconds to integer half-open frame count.
   */
  secondsToFrames(seconds: number): number {
    return Math.round((seconds * this.fpsNumerator) / this.fpsDenominator);
  }

  /**
   * Convert frames to seconds.
   */
  framesToSeconds(frames: number): number {
    return (frames * this.fpsDenominator) / this.fpsNumerator;
  }

  /**
   * Convert microseconds to frames.
   */
  usToFrames(us: number): number {
    return this.secondsToFrames(us / 1_000_000);
  }

  /**
   * Convert frames to microseconds.
   */
  framesToUs(frames: number): number {
    return Math.round(this.framesToSeconds(frames) * 1_000_000);
  }

  /**
   * Convert frames to audio sample offset.
   */
  framesToSamples(frames: number): number {
    const seconds = this.framesToSeconds(frames);
    return Math.round(seconds * this.sampleRate);
  }

  /**
   * Map an original source microsecond timestamp into the edited timeline frame,
   * taking into account cut points and speed factors.
   */
  mapSourceUsToOutputFrame(
    sourceUs: number,
    cuts: Array<{
      source_start_us: number;
      source_end_us: number;
      output_start_frame: number;
      output_end_frame: number;
      speed_factor: number;
    }>
  ): number | null {
    for (const cut of cuts) {
      if (!Number.isFinite(cut.speed_factor) || cut.speed_factor <= 0) {
        throw new Error(`Cut speed_factor must be > 0, got ${cut.speed_factor}`);
      }
      if (sourceUs >= cut.source_start_us && sourceUs < cut.source_end_us) {
        const offsetUs = (sourceUs - cut.source_start_us) / cut.speed_factor;
        // Floor, not round: a timestamp belongs to the frame interval [n, n+1) that contains it.
        // Rounding would push the last microseconds of a cut onto output_end_frame (exclusive).
        const offsetFrames = Math.floor((offsetUs / 1_000_000) * this.fpsNumerator / this.fpsDenominator);
        const mappedFrame = cut.output_start_frame + offsetFrames;
        if (mappedFrame < cut.output_end_frame) {
          return mappedFrame;
        }
      }
    }
    return null; // The source frame was cut out
  }
}

