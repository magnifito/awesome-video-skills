export interface CountdownValues {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  formattedText: string;
}

export class CampaignTimer {
  /**
   * Calculates countdown offset strictly against frozen campaign reference time.
   * As specified in Section 8: "A countdown renders from a fixed campaign reference time
   * recorded in the manifest. It must not read the computer's current date while generating frames."
   */
  static calculateRemaining(
    campaignReferenceIso: string,
    targetDeadlineIso: string,
    sceneElapsedSeconds: number,
    locale = 'en'
  ): CountdownValues {
    const referenceEpoch = new Date(campaignReferenceIso).getTime();
    const deadlineEpoch = new Date(targetDeadlineIso).getTime();

    // Virtual frame time: reference time + seconds elapsed in video
    const virtualFrameEpoch = referenceEpoch + Math.round(sceneElapsedSeconds * 1000);
    const diffMs = Math.max(0, deadlineEpoch - virtualFrameEpoch);

    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let formattedText = `${days}d ${hours}h ${minutes}m`;
    if (locale === 'bg') {
      formattedText = `Остават ${days} дни и ${hours} ч.`;
    }

    return {
      days,
      hours,
      minutes,
      seconds,
      formattedText
    };
  }
}
