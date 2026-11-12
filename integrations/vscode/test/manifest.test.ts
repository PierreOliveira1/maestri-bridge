import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOCALES, placeholdersOf } from '../src/i18n/index.ts';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

function stringRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) {
    throw new Error('JSON inválido');
  }
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') {
      throw new Error(`Valor inválido em ${key}`);
    }
    result[key] = item;
  }
  return result;
}

const manifest = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const source = stringRecord(readJson('../package.nls.json'));
const sourceKeys = Object.keys(source).sort();
const translated = LOCALES.filter((locale) => locale !== 'en');

describe('manifesto', () => {
  it('usa só chaves que existem no package.nls.json', () => {
    const used = [...manifest.matchAll(/"%([^"%]+)%"/g)].map((match) => match[1] ?? '');
    expect(used.length).toBeGreaterThan(0);
    for (const key of used) {
      expect(source[key], key).toBeDefined();
    }
  });

  it('não deixa chave sobrando no package.nls.json', () => {
    for (const key of sourceKeys) {
      expect(manifest.includes(`"%${key}%"`), key).toBe(true);
    }
  });

  it.each(translated)('package.nls.%s.json tem as mesmas chaves e parâmetros', (locale) => {
    const messages = stringRecord(readJson(`../package.nls.${locale}.json`));
    expect(Object.keys(messages).sort()).toEqual(sourceKeys);
    for (const key of sourceKeys) {
      expect(messages[key]?.trim(), `${locale} ${key}`).not.toBe('');
      expect(placeholdersOf(messages[key] ?? ''), `${locale} ${key}`).toEqual(
        placeholdersOf(source[key] ?? ''),
      );
    }
  });
});
