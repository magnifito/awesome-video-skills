export interface LanguagePacingAnalysis {
  language: string;
  word_count: number;
  estimated_speech_seconds: number;
  words_per_minute: number;
  fits_within_target_duration: boolean;
  recommended_duration_seconds: number;
  pacing_status: 'relaxed' | 'optimal' | 'rushed' | 'exceeds_limit';
}

export interface LocalizationSyncReport {
  source_language: string;
  target_language: string;
  source_words: number;
  target_words: number;
  expansion_ratio: number; // e.g. 1.22 = 22% longer
  source_pacing: LanguagePacingAnalysis;
  target_pacing: LanguagePacingAnalysis;
  duration_adjusted: boolean;
}

export class LocalizationSynchronizer {
  /**
   * Standard speaking rates (words per minute):
   * English explainer: ~140 WPM (2.33 words/sec)
   * Bulgarian explainer: ~120-130 WPM (2.0-2.16 words/sec due to polysyllabic words)
   */
  private static readonly SPEAKING_RATES_WPM: Record<string, number> = {
    en: 140,
    bg: 125,
    de: 120,
    es: 145,
    fr: 135
  };

  static analyzePacing(text: string, targetDurationSeconds: number, language = 'en'): LanguagePacingAnalysis {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    const baseWpm = this.SPEAKING_RATES_WPM[language] || 135;
    const estimatedSeconds = Math.round((wordCount / (baseWpm / 60)) * 10) / 10;
    const actualWpm = targetDurationSeconds > 0 ? Math.round((wordCount / (targetDurationSeconds / 60))) : 0;

    let pacingStatus: LanguagePacingAnalysis['pacing_status'] = 'optimal';
    if (actualWpm < baseWpm * 0.75) {
      pacingStatus = 'relaxed';
    } else if (actualWpm > baseWpm * 1.3) {
      pacingStatus = 'exceeds_limit';
    } else if (actualWpm > baseWpm * 1.1) {
      pacingStatus = 'rushed';
    }

    const fits = estimatedSeconds <= targetDurationSeconds;
    const recommendedDuration = fits ? targetDurationSeconds : Math.ceil(estimatedSeconds * 1.1);

    return {
      language,
      word_count: wordCount,
      estimated_speech_seconds: estimatedSeconds,
      words_per_minute: actualWpm,
      fits_within_target_duration: fits,
      recommended_duration_seconds: recommendedDuration,
      pacing_status: pacingStatus
    };
  }

  static synchronizeScenes(
    sourceText: string,
    targetText: string,
    targetDurationSeconds: number,
    sourceLang = 'en',
    targetLang = 'bg'
  ): LocalizationSyncReport {
    const sourcePacing = this.analyzePacing(sourceText, targetDurationSeconds, sourceLang);
    const targetPacing = this.analyzePacing(targetText, targetDurationSeconds, targetLang);

    const expansion = sourcePacing.word_count > 0
      ? Math.round((targetPacing.word_count / sourcePacing.word_count) * 100) / 100
      : 1.0;

    return {
      source_language: sourceLang,
      target_language: targetLang,
      source_words: sourcePacing.word_count,
      target_words: targetPacing.word_count,
      expansion_ratio: expansion,
      source_pacing: sourcePacing,
      target_pacing: targetPacing,
      duration_adjusted: !targetPacing.fits_within_target_duration
    };
  }
}
