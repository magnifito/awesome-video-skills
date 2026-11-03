export interface AudioTrack {
  id: string;
  title: string;
  category: 'music' | 'sfx' | 'room_tone';
  mood: 'energetic' | 'corporate' | 'calm' | 'cinematic' | 'tech';
  bpm: number;
  duration_seconds: number;
  license: string;
  relative_path: string;
  ducking_attenuation_db: number;
}

export interface DuckingEnvelopePoint {
  time_seconds: number;
  volume_factor: number; // 1.0 = 0dB, 0.125 = -18dB
}

export class AudioCatalogManager {
  private static readonly CURATED_TRACKS: AudioTrack[] = [
    {
      id: 'bg-tech-pulse',
      title: 'Tech Innovation Pulse',
      category: 'music',
      mood: 'tech',
      bpm: 124,
      duration_seconds: 30.0,
      license: 'CC0-1.0',
      relative_path: 'assets/audio/tech-pulse.mp3',
      ducking_attenuation_db: -18
    },
    {
      id: 'bg-corporate-uplift',
      title: 'Modern Enterprise Uplift',
      category: 'music',
      mood: 'corporate',
      bpm: 110,
      duration_seconds: 60.0,
      license: 'CC0-1.0',
      relative_path: 'assets/audio/corporate-uplift.mp3',
      ducking_attenuation_db: -16
    },
    {
      id: 'bg-calm-explainer',
      title: 'Gentle Acoustic Narrative',
      category: 'music',
      mood: 'calm',
      bpm: 92,
      duration_seconds: 45.0,
      license: 'CC0-1.0',
      relative_path: 'assets/audio/calm-explainer.mp3',
      ducking_attenuation_db: -20
    },
    {
      id: 'sfx-pop-riser',
      title: 'Subtle UI Pop & Riser',
      category: 'sfx',
      mood: 'tech',
      bpm: 0,
      duration_seconds: 1.5,
      license: 'CC0-1.0',
      relative_path: 'assets/audio/sfx-pop.wav',
      ducking_attenuation_db: 0
    }
  ];

  static listTracks(category?: AudioTrack['category'], mood?: AudioTrack['mood']): AudioTrack[] {
    return this.CURATED_TRACKS.filter(t => {
      if (category && t.category !== category) return false;
      if (mood && t.mood !== mood) return false;
      return true;
    });
  }

  static findTrackForScene(targetDurationSeconds: number, preferredMood: AudioTrack['mood'] = 'tech'): AudioTrack {
    const candidates = this.listTracks('music', preferredMood);
    if (candidates.length === 0) {
      return this.CURATED_TRACKS[0];
    }

    // Pick track closest to or exceeding target duration
    let best = candidates[0];
    let minDiff = Infinity;
    for (const c of candidates) {
      const diff = Math.abs(c.duration_seconds - targetDurationSeconds);
      if (diff < minDiff) {
        minDiff = diff;
        best = c;
      }
    }
    return best;
  }

  /**
   * Generates volume keyframes for dialogue sidechain ducking.
   * Envelope: a 0.3 s fade-down that starts 0.4 s before speech (fully ducked 0.1 s before it),
   * a hold until 0.1 s after speech ends, then a 0.5 s fade back to full level.
   */
  static generateDuckingEnvelope(
    speechStartSeconds: number,
    speechDurationSeconds: number,
    attenuationDb = -18
  ): DuckingEnvelopePoint[] {
    const speechEnd = speechStartSeconds + speechDurationSeconds;
    const duckFactor = Math.pow(10, attenuationDb / 20); // e.g. -18dB ~ 0.126

    return [
      { time_seconds: Math.max(0, speechStartSeconds - 0.4), volume_factor: 1.0 },
      { time_seconds: Math.max(0, speechStartSeconds - 0.1), volume_factor: duckFactor },
      { time_seconds: speechEnd + 0.1, volume_factor: duckFactor },
      { time_seconds: speechEnd + 0.6, volume_factor: 1.0 }
    ];
  }
}

