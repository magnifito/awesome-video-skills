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
  musicBedGainDb?: number;        // static music bed level before ducking, default -8 dB
  silenceDurationSeconds?: number; // length of synthesized silence when no tracks are given, default 15
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
      sampleRate = 48000,
      musicBedGainDb = -8,
      silenceDurationSeconds = 15
    } = options;

    if (!Number.isFinite(duckingAttenuationDb) || duckingAttenuationDb > 0) {
      throw new Error(`duckingAttenuationDb must be a non-positive number of dB, got ${duckingAttenuationDb}`);
    }

    if (!voiceTrackPath && !musicTrackPath) {
      // Synthesize clean silence if no tracks provided
      const args = [
        '-y',
        '-f', 'lavfi',
        '-i', `anullsrc=r=${sampleRate}:cl=stereo`,
        '-t', String(silenceDurationSeconds),
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

    // Both voice and music: apply sidechain ducking.
    // The voice is split so it can drive the compressor and still be mixed.
    // Threshold sits at -30 dBFS; with a hard ratio, a voice ~20 dB above threshold
    // reduces the music by about |duckingAttenuationDb| dB: reduction = over * (1 - 1/ratio).
    const attenuation = Math.abs(duckingAttenuationDb);
    const overThresholdDb = 20;
    const ratio = attenuation >= overThresholdDb
      ? 20
      : Math.min(20, Math.max(1, 1 / (1 - attenuation / overThresholdDb)));
    const filterComplex = [
      `[0:a]asplit=2[voice_mix][voice_key]`,
      `[1:a]volume=${musicBedGainDb}dB[music_bed]`,
      `[music_bed][voice_key]sidechaincompress=threshold=0.0316:ratio=${ratio.toFixed(2)}:attack=100:release=350[ducked_music]`,
      `[voice_mix][ducked_music]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[mixed]`,
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

