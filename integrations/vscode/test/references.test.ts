import { describe, expect, it } from 'vitest';
import { buildReferences, referencePath } from '../src/references.ts';
import type { DocumentInfo, SelectionRange } from '../src/references.ts';

const document: DocumentInfo = { path: 'src/app.ts', languageId: 'typescript' };

function selection(overrides: Partial<SelectionRange>): SelectionRange {
  return {
    startLine: 0,
    startCharacter: 0,
    endLine: 0,
    endCharacter: 0,
    text: '',
    ...overrides,
  };
}

describe('buildReferences', () => {
  it('monta uma seleção de linha única', () => {
    const refs = buildReferences(document, [
      selection({ startLine: 4, startCharacter: 2, endLine: 4, endCharacter: 10, text: 'const x' }),
    ]);

    expect(refs).toEqual([
      {
        path: 'src/app.ts',
        startLine: 5,
        endLine: 5,
        language: 'typescript',
        text: 'const x',
      },
    ]);
  });

  it('monta uma seleção de várias linhas', () => {
    const refs = buildReferences(document, [
      selection({ startLine: 2, endLine: 4, endCharacter: 5, text: 'a\nb\nc' }),
    ]);

    expect(refs).toEqual([
      {
        path: 'src/app.ts',
        startLine: 3,
        endLine: 5,
        language: 'typescript',
        text: 'a\nb\nc',
      },
    ]);
  });

  it('não conta a linha seguinte quando termina na coluna 0', () => {
    const refs = buildReferences(document, [
      selection({ startLine: 2, endLine: 5, endCharacter: 0, text: 'a\nb\nc\n' }),
    ]);

    expect(refs).toEqual([
      {
        path: 'src/app.ts',
        startLine: 3,
        endLine: 5,
        language: 'typescript',
        text: 'a\nb\nc\n',
      },
    ]);
  });

  it('descarta seleções só com espaços', () => {
    const refs = buildReferences(document, [
      selection({ startLine: 1, endLine: 1, endCharacter: 4, text: '   \n  ' }),
    ]);

    expect(refs).toEqual([{ path: 'src/app.ts', language: 'typescript' }]);
  });

  it('devolve só o caminho quando não há seleções', () => {
    expect(buildReferences(document, [])).toEqual([
      { path: 'src/app.ts', language: 'typescript' },
    ]);
  });

  it('ordena as referências por startLine', () => {
    const refs = buildReferences(document, [
      selection({ startLine: 10, endCharacter: 3, text: 'depois' }),
      selection({ startLine: 2, endCharacter: 3, text: 'antes' }),
      selection({ startLine: 6, endCharacter: 3, text: 'meio' }),
    ]);

    expect(refs.map((ref) => ref.startLine)).toEqual([3, 7, 11]);
    expect(refs.map((ref) => ref.text)).toEqual(['antes', 'meio', 'depois']);
  });
});

describe('referencePath', () => {
  it('devolve caminho relativo em formato POSIX', () => {
    expect(referencePath('/projetos/app/src/app.ts', '/projetos/app')).toBe('src/app.ts');
  });

  it('devolve o caminho absoluto sem pasta de trabalho', () => {
    expect(referencePath('/projetos/app/src/app.ts', undefined)).toBe('/projetos/app/src/app.ts');
  });

  it('devolve o caminho absoluto quando está fora da pasta', () => {
    expect(referencePath('/outro/app/src/app.ts', '/projetos/app')).toBe(
      '/outro/app/src/app.ts',
    );
  });
});
