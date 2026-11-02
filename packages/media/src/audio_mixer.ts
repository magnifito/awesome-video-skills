import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface AudioMixOptions {
  voiceTrackPath?: string;
  musicTrackPath?: string;
  outputPath: string;
  duckingAttenuationDb?: number; // default -14 dB
  targetLoudnessLufs?: number;    // default -16.0
  truePeakCeilingDb?: number;     // default -1.0
  sampleRate?: number;            // default 48000
}

export class AudioMixer {
  /**
   * Mix voiceover and background music with automatic sidechain ducking and broadcast loudness normalization.
   */
  static async mixWithDucking(options: AudioMixOptions): Promise<string> {
    const {
      voiceTrackPath,
      musicTrackPath,
      outputPath,
      duckingAttenuationDb = -14,
      targetLoudnessLufs = -16.0,
      truePeakCeilingDb = -1.0,
      sampleRate = 48000
    } = options;

    if (!voiceTrackPath && !musicTrackPath) {
      // Synthesize clean silence if no tracks provided
      const args = [
        '-y',
        '-f', 'lavfi',
        '-i', `anullsrc=r=${sampleRate}:cl=stereo`,
        '-t', '15',
        '-c:a', 'aac',
        '-b:a', '192k',
        outputPath
      ];
      await execFileAsync('ffmpeg', args);
      return outputPath;
    }

    if (voiceTrackPath && !musicTrackPath) {
      // Just normalize voiceover
      const args = [
        '-y',
        '-i', voiceTrackPath,
        '-af', `loudnorm=I=${targetLoudnessLufs}:TP=${truePeakCeilingDb}:LRA=11`,
        '-ar', sampleRate.toString(),
        '-c:a', 'aac',
        '-b:a', '192k',
        outputPath
      ];
      await execFileAsync('ffmpeg', args);
      return outputPath;
    }

    // Both voice and music: apply sidechain ducking filter
    // When voice has signal, duck music by duckingAttenuationDb
    const filterComplex = [
      `[1:a]volume=0.4[music_bed]`,
      `[music_bed][0:a]sidechaincompress=threshold=0.1:ratio=4:attack=100:release=350[ducked_music]`,
      `[0:a][ducked_music]amix=inputs=2:duration=first:dropout_transition=2[mixed]`,
      `[mixed]loudnorm=I=${targetLoudnessLufs}:TP=${truePeakCeilingDb}:LRA=11[out]`
    ].join(';');

    const args = [
      '-y',
      '-i', voiceTrackPath!,
      '-i', musicTrackPath!,
      '-filter_complex', filterComplex,
      '-map', '[out]',
      '-ar', sampleRate.toString(),
      '-c:a', 'aac',
      '-b:a', '192k',
      outputPath
    ];

    await execFileAsync('ffmpeg', args);
    return outputPath;
  }
}

