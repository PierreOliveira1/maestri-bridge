import { afterEach, describe, expect, it } from 'vitest';
import {
  LOCALES,
  currentLocale,
  formatMessage,
  messagesFor,
  placeholdersOf,
  resolveLocale,
  setLocale,
} from '../src/i18n/index.ts';
import type { MessageKey } from '../src/i18n/index.ts';

describe('resolveLocale', () => {
  it.each([
    ['en', 'en'],
    ['en-us', 'en'],
    ['pt-br', 'pt-br'],
    ['pt', 'pt-br'],
    ['pt-PT', 'pt-br'],
    ['es-419', 'es'],
    ['fr-CA', 'fr'],
    ['de', 'de'],
    ['ja', 'ja'],
    ['zh-cn', 'zh-cn'],
    ['zh-Hans', 'zh-cn'],
    ['zh_CN', 'zh-cn'],
    ['zh-tw', 'en'],
    ['zh-Hant', 'en'],
    ['ko', 'en'],
    ['', 'en'],
    [undefined, 'en'],
  ])('%s vira %s', (input, expected) => {
    expect(resolveLocale(input)).toBe(expected);
  });
});

describe('formatMessage', () => {
  it('troca os parâmetros conhecidos e mantém os desconhecidos', () => {
    expect(formatMessage('{name} tem {count} agentes {x}', { name: 'Trilha', count: 2 })).toBe(
      'Trilha tem 2 agentes {x}',
    );
  });

  it('devolve o texto sem parâmetros como está', () => {
    expect(formatMessage('Olá {name}')).toBe('Olá {name}');
  });
});

describe('setLocale', () => {
  const previous = currentLocale();
  afterEach(() => {
    setLocale(previous);
  });

  it('troca o idioma atual', () => {
    setLocale('ja');
    expect(currentLocale()).toBe('ja');
  });
});

describe('catálogos', () => {
  const source = messagesFor('en');
  const keys = Object.keys(source) as MessageKey[];

  it.each(LOCALES)('%s tem todas as chaves, sem textos vazios', (locale) => {
    const messages = messagesFor(locale);
    expect(Object.keys(messages).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(String(messages[key]).trim(), `${locale} ${key}`).not.toBe('');
    }
  });

  it.each(LOCALES)('%s usa os mesmos parâmetros do inglês', (locale) => {
    const messages = messagesFor(locale);
    for (const key of keys) {
      expect(placeholdersOf(messages[key]), `${locale} ${key}`).toEqual(placeholdersOf(source[key]));
    }
  });
});
