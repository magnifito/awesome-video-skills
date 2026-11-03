export interface LexiconEntry {
  term: string;
  locale: string;
  spoken_form: string;
  ipa_phonemes?: string;
  stress_marked?: string;
  rule_type: 'acronym' | 'brand_name' | 'loanword';
}

export class BrandLexicon {
  private static defaultEntries: LexiconEntry[] = [
    {
      term: 'SKU',
      locale: 'en',
      spoken_form: 'S-K-U',
      rule_type: 'acronym'
    },
    {
      term: 'CatalogSpark',
      locale: 'en',
      spoken_form: 'Catalog Spark',
      ipa_phonemes: '/ˈkætəlɔɡ spɑːrk/',
      rule_type: 'brand_name'
    },
    {
      term: 'софтуер',
      locale: 'bg',
      spoken_form: 'софтуер',
      stress_marked: 'софтуе́р',
      rule_type: 'loanword'
    },
    {
      term: 'програмист',
      locale: 'bg',
      spoken_form: 'програмист',
      stress_marked: 'програми́ст',
      rule_type: 'loanword'
    }
  ];

  /** Escapes a term for literal use inside a RegExp. */
  private static escapeRegExp(term: string): string {
    return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Builds a whole-word matcher that is Unicode-aware: JavaScript's \b only knows ASCII
   * word characters, so Cyrillic terms would never match with it.
   */
  private static wordRegExp(term: string, flags = 'gu'): RegExp {
    return new RegExp(`(?<![\\p{L}\\p{N}_])${this.escapeRegExp(term)}(?![\\p{L}\\p{N}_])`, flags);
  }

  /**
   * Rewrites acronyms and brand names into their spoken forms for TTS.
   * Loanword entries only carry stress guidance and are surfaced by getPronunciationGuide.
   */
  static normalizePronunciation(text: string, locale: string, customEntries: LexiconEntry[] = []): string {
    const all = [...this.defaultEntries, ...customEntries].filter(e => e.locale === locale);
    // Longest terms first so "SKU ID" wins over "SKU".
    all.sort((a, b) => b.term.length - a.term.length);
    let output = text;
    for (const entry of all) {
      if (entry.rule_type === 'acronym' || entry.rule_type === 'brand_name') {
        output = output.replace(this.wordRegExp(entry.term), entry.spoken_form);
      }
    }
    return output;
  }

  static getPronunciationGuide(text: string, locale: string, customEntries: LexiconEntry[] = []): LexiconEntry[] {
    const entries = [...this.defaultEntries, ...customEntries].filter(e => e.locale === locale);
    return entries.filter(e => this.wordRegExp(e.term, 'iu').test(text));
  }
}
