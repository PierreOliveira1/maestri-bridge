import { de } from './locales/de/index.ts';
import { en } from './locales/en/index.ts';
import { es } from './locales/es/index.ts';
import { fr } from './locales/fr/index.ts';
import { ja } from './locales/ja/index.ts';
import { ptBr } from './locales/pt-br/index.ts';
import { zhCn } from './locales/zh-cn/index.ts';
import type { MessageKey, MessageParams, Messages } from './messages.ts';

export type { MessageKey, MessageParams, Messages } from './messages.ts';

export const LOCALES = ['en', 'pt-br', 'es', 'fr', 'de', 'ja', 'zh-cn'] as const;
export type LocaleId = (typeof LOCALES)[number];

const catalogs: Record<LocaleId, Messages> = {
  en,
  'pt-br': ptBr,
  es,
  fr,
  de,
  ja,
  'zh-cn': zhCn,
};

let current: LocaleId = 'en';

export function isLocaleId(value: unknown): value is LocaleId {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(language: string | undefined): LocaleId {
  const normalized = (language ?? '').trim().toLowerCase().replace(/_/g, '-');
  if (normalized === '') {
    return 'en';
  }
  if (isLocaleId(normalized)) {
    return normalized;
  }
  const [base = ''] = normalized.split('-');
  if (base === 'pt') {
    return 'pt-br';
  }
  if (base === 'zh') {
    return /^zh-(tw|hk|mo|hant)/.test(normalized) ? 'en' : 'zh-cn';
  }
  return isLocaleId(base) ? base : 'en';
}

export function setLocale(locale: LocaleId): void {
  current = locale;
}

export function currentLocale(): LocaleId {
  return current;
}

export function formatMessage(template: string, params?: MessageParams): string {
  if (params === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function placeholdersOf(template: string): string[] {
  return [...new Set([...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? ''))].sort();
}

export function messagesFor(locale: LocaleId): Messages {
  return catalogs[locale];
}

export function translate(locale: LocaleId, key: MessageKey, params?: MessageParams): string {
  return formatMessage(messagesFor(locale)[key], params);
}

export function t(key: MessageKey, params?: MessageParams): string {
  return translate(current, key, params);
}
