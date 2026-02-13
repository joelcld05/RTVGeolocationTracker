import en from "@/locales/en";
import es from "@/locales/es";

export const translations = { en, es } as const;

export type LanguageCode = keyof typeof translations;

type TranslationDictionary = typeof en;

export function translate(
  language: LanguageCode,
  key: string,
  params?: Record<string, string | number>,
): string {
  const dictionary = translations[language] as TranslationDictionary;
  const value = key
    .split(".")
    .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], dictionary);

  if (typeof value !== "string") {
    return key;
  }

  if (!params) {
    return value;
  }

  return value.replace(/\{(\w+)\}/g, (_, token) => String(params[token] ?? `{${token}}`));
}
