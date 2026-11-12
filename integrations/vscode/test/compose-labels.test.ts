import { describe, expect, it } from 'vitest';
import type { CodeReference } from '@maestri-bridge/core';
import { fullLineRange, threadLabel } from '../src/compose-labels.ts';

const references: CodeReference[] = [
  { path: 'src/app.ts', startLine: 1, endLine: 3, language: 'typescript' },
];

describe('threadLabel', () => {
  it('mostra o agente escolhido', () => {
    expect(threadLabel(references, 'Agente')).toBe(
      'Maestri · src/app.ts:1-3 (typescript) → Agente',
    );
  });

  it('pede para escolher o agente quando não há agente', () => {
    expect(threadLabel(references, undefined)).toBe(
      'Maestri · src/app.ts:1-3 (typescript) · clique em 👤 para escolher o agente',
    );
  });

  it('usa arquivo atual sem referências', () => {
    expect(threadLabel([], undefined)).toBe(
      'Maestri · arquivo atual · clique em 👤 para escolher o agente',
    );
    expect(threadLabel([], 'Agente')).toBe('Maestri · arquivo atual → Agente');
  });

  it('resume várias referências', () => {
    const many: CodeReference[] = [
      { path: 'src/a.ts' },
      { path: 'src/b.ts' },
      { path: 'src/c.ts' },
    ];
    expect(threadLabel(many, 'Agente')).toBe('Maestri · src/a.ts, src/b.ts +1 → Agente');
  });
});

describe('fullLineRange', () => {
  it('cobre a linha inteira', () => {
    expect(fullLineRange(4, 12)).toEqual({
      startLine: 4,
      startCharacter: 0,
      endLine: 4,
      endCharacter: 12,
    });
  });

  it('aceita linha vazia', () => {
    expect(fullLineRange(0, 0)).toEqual({
      startLine: 0,
      startCharacter: 0,
      endLine: 0,
      endCharacter: 0,
    });
  });
});
