export interface TextFitOptions {
  cardWidth: number;
  cardHeight: number;
  maxLines?: number;
  baseFontSize?: number;
  minFontSize?: number;
  lineHeightRatio?: number;
  horizontalPadding?: number;
  verticalPadding?: number;
}

export interface TextFitResult {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  totalTextHeight: number;
  scaleFactor: number;
  fits: boolean;
}

export class TypographyFitter {
  /**
   * Approximates character width relative to font size for typical sans-serif fonts (e.g. Inter/Geist).
   * Average character width ~ 0.52 * fontSize.
   */
  private static readonly AVG_CHAR_WIDTH_RATIO = 0.52;

  static wrapText(text: string, maxLineWidthPx: number, fontSize: number): string[] {
    const words = text.trim().split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    const charWidth = fontSize * this.AVG_CHAR_WIDTH_RATIO;
    const maxCharsPerLine = Math.max(1, Math.floor(maxLineWidthPx / charWidth));

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (candidate.length <= maxCharsPerLine) {
        currentLine = candidate;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    return lines;
  }

  static fitText(text: string, options: TextFitOptions): TextFitResult {
    const baseFontSize = options.baseFontSize ?? 48;
    const minFontSize = options.minFontSize ?? 24;
    const maxLines = options.maxLines ?? 4;
    const lineHeightRatio = options.lineHeightRatio ?? 1.25;
    const hPadding = options.horizontalPadding ?? 40;
    const vPadding = options.verticalPadding ?? 40;

    const availableWidth = Math.max(100, options.cardWidth - (hPadding * 2));
    const availableHeight = Math.max(50, options.cardHeight - (vPadding * 2));

    let currentFontSize = baseFontSize;
    let lines: string[] = [];
    let fits = false;

    while (currentFontSize >= minFontSize) {
      lines = this.wrapText(text, availableWidth, currentFontSize);
      const lineHeight = Math.round(currentFontSize * lineHeightRatio);
      const totalTextHeight = lines.length * lineHeight;

      if (lines.length <= maxLines && totalTextHeight <= availableHeight) {
        fits = true;
        return {
          lines,
          fontSize: currentFontSize,
          lineHeight,
          totalTextHeight,
          scaleFactor: Math.round((currentFontSize / baseFontSize) * 100) / 100,
          fits: true
        };
      }
      currentFontSize -= 2; // Step down font size
    }

    // Minimum size reached
    const finalLineHeight = Math.round(minFontSize * lineHeightRatio);
    return {
      lines: this.wrapText(text, availableWidth, minFontSize).slice(0, maxLines),
      fontSize: minFontSize,
      lineHeight: finalLineHeight,
      totalTextHeight: lines.length * finalLineHeight,
      scaleFactor: Math.round((minFontSize / baseFontSize) * 100) / 100,
      fits: false
    };
  }
}

