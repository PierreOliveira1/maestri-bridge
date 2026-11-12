import { describe, expect, it } from 'vitest';
import { compactPreviewLine, isPreviewChrome, meaningfulPreview } from '../src/preview.ts';

describe('compactPreviewLine', () => {
  it('remove bordas de TUI e espaços repetidos', () => {
    expect(compactPreviewLine('  ┃      return ref.path   + suffix;   ┃')).toBe('return ref.path + suffix;');
  });

  it('mantém linhas sem borda', () => {
    expect(compactPreviewLine('OK CAIXA')).toBe('OK CAIXA');
  });
});

describe('isPreviewChrome', () => {
  it.each([
    '╹▀▀▀▀▀▀▀▀▀▀▀▀',
    '───────',
    '…/roles/7aabfe05-bc88:main 208.7K (21%) · $0.21 ctrl+p commands',
    'Build · DeepSeek V4.1 Flash 1017 · 2.9s · 16.3 tok/s',
    'Build · DeepSeek V4.1 Flash 1017 OpenCode Go · max',
    '✢ Tempering… (8s · ↓ 86 tokens)',
    '⎿ Tip: Did you know you can drag and drop image files into your terminal?',
    'Tip: Use /btw to ask a quick side question',
    'esc to interrupt',
    'Ask anything… "Fix a TODO in the codebase"',
    '/update to install v2.2.7',
    '2.0.14',
  ])('reconhece %s como moldura', (line) => {
    expect(isPreviewChrome(line)).toBe(true);
  });

  it.each([
    'OK CAIXA',
    'Enviado para Trilha.',
    '22 testes passando; pnpm exec tsc -p tsconfig.json → sem erros.',
    'Build falhou em 3 arquivos',
    'Do you want to proceed? (y/n)',
    'Updated to 2.0.14 with fixes',
  ])('mantém %s', (line) => {
    expect(isPreviewChrome(line)).toBe(false);
  });
});

describe('meaningfulPreview', () => {
  it('devolve só as linhas com conteúdo, compactadas e na ordem', () => {
    const preview = [
      '  ┃  OK CAIXA',
      '',
      '     Build · DeepSeek V4.1 Flash 1017 · 2.9s · 16.3 tok/s',
      '  ┃',
      '  ┃  Build · DeepSeek V4.1 Flash 1017 OpenCode Go · max',
      '  ╹▀▀▀▀▀▀▀▀▀▀',
      '  …/rol…/7aabfe05:main  208.7K (21%) · $0.21  ctrl+p commands',
    ];
    expect(meaningfulPreview(preview)).toEqual(['OK CAIXA']);
  });

  it('devolve lista vazia quando só há moldura', () => {
    expect(meaningfulPreview(['', '  ┃  ', '───'])).toEqual([]);
  });
});
