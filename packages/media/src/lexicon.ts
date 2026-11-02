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

  static normalizePronunciation(text: string, locale: string, customEntries: LexiconEntry[] = []): string {
    const all = [...this.defaultEntries, ...customEntries].filter(e => e.locale === locale);
    let output = text;

    for (const entry of all) {
      if (entry.rule_type === 'acronym') {
        const regex = new RegExp(`\\b${entry.term}\\b`, 'g');
        output = output.replace(regex, entry.spoken_form);
      }
    }

    return output;
  }

  static getPronunciationGuide(text: string, locale: string): LexiconEntry[] {
    const matched: LexiconEntry[] = [];
    const entries = this.defaultEntries.filter(e => e.locale === locale);

    for (const e of entries) {
      if (text.toLowerCase().includes(e.term.toLowerCase())) {
        matched.push(e);
      }
    }

    return matched;
  }
}

