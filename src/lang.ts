import type { Lang } from './types'

export const LANG_NAMES: Record<Lang, string> = {
  de: 'German',
  en: 'English',
  bcs: 'Bosnian/Croatian/Serbian (Latin script)',
  tr: 'Turkish',
  ar: 'Arabic',
  uk: 'Ukrainian',
}

export const normLang = (x: unknown): Lang =>
  (['de', 'en', 'bcs', 'tr', 'ar', 'uk'] as const).includes(x as Lang) ? (x as Lang) : 'de'

// UI texts on the server exist in de + en; other languages use en as base
export const uiLang = (l: Lang): 'de' | 'en' => (l === 'de' ? 'de' : 'en')

export const levelText = (simple: boolean) =>
  simple
    ? 'Use PLAIN LANGUAGE (level A2, "Leichte Sprache"): very short sentences (max 12 words), no jargon, explain every official term in brackets.'
    : 'Be clear, friendly and short. Explain official terms the first time you use them.'
