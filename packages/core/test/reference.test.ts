import { describe, expect, it } from 'vitest';
import { fenceFor, fenceLanguage, formatPrompt, formatReferenceHeader } from '../src/reference.ts';
import type { CodeReference } from '../src/reference.ts';

describe('fenceLanguage', () => {
  it('mapeia ids conhecidos do VS Code', () => {
    expect(fenceLanguage('typescriptreact')).toBe('tsx');
    expect(fenceLanguage('javascriptreact')).toBe('jsx');
    expect(fenceLanguage('shellscript')).toBe('bash');
    expect(fenceLanguage('plaintext')).toBe('');
    expect(fenceLanguage(undefined)).toBe('');
  });

  it('passa outros valores em minúsculas', () => {
    expect(fenceLanguage('TypeScript')).toBe('typescript');
  });
});

describe('formatReferenceHeader', () => {
  it('usa apenas o caminho quando não há startLine', () => {
    expect(formatReferenceHeader({ path: 'src/app.ts' })).toBe('src/app.ts');
  });

  it('mostra uma linha única', () => {
    expect(formatReferenceHeader({ path: 'src/app.ts', startLine: 42 })).toBe('src/app.ts:42');
    expect(formatReferenceHeader({ path: 'src/app.ts', startLine: 42, endLine: 42 })).toBe(
      'src/app.ts:42',
    );
  });

  it('mostra o intervalo quando endLine é maior', () => {
    expect(formatReferenceHeader({ path: 'src/app.ts', startLine: 42, endLine: 58 })).toBe(
      'src/app.ts:42-58',
    );
  });

  it('inverte o intervalo quando endLine é menor', () => {
    expect(formatReferenceHeader({ path: 'src/app.ts', startLine: 58, endLine: 42 })).toBe(
      'src/app.ts:42-58',
    );
  });

  it('acrescenta a linguagem mapeada', () => {
    expect(
      formatReferenceHeader({
        path: 'src/app.tsx',
        startLine: 1,
        endLine: 2,
        language: 'typescriptreact',
      }),
    ).toBe('src/app.tsx:1-2 (tsx)');
  });

  it('omite a linguagem quando não há ou é plaintext', () => {
    expect(formatReferenceHeader({ path: 'src/app.ts', startLine: 1 })).toBe('src/app.ts:1');
    expect(formatReferenceHeader({ path: 'src/app.ts', startLine: 1, language: 'plaintext' })).toBe(
      'src/app.ts:1',
    );
  });
});

describe('fenceFor', () => {
  it('usa três crases por padrão', () => {
    expect(fenceFor('const a = 1;')).toBe('```');
    expect(fenceFor('')).toBe('```');
  });

  it('usa quatro crases quando o texto contém três', () => {
    expect(fenceFor('a\n```\nb')).toBe('````');
  });

  it('usa cinco crases quando o texto contém quatro', () => {
    expect(fenceFor('a\n````\nb')).toBe('`````');
  });
});

describe('formatPrompt', () => {
  it('monta a mensagem com uma referência completa', () => {
    const reference: CodeReference = {
      path: 'src/app.ts',
      startLine: 42,
      endLine: 58,
      language: 'typescript',
      text: 'const x = 1;\nconst y = 2;',
    };

    expect(formatPrompt('Explique isso', [reference])).toBe(
      [
        'Explique isso',
        '',
        'Reference: src/app.ts:42-58 (typescript)',
        '```typescript',
        'const x = 1;',
        'const y = 2;',
        '```',
      ].join('\n'),
    );
  });

  it('separa duas referências com uma linha em branco', () => {
    const references: CodeReference[] = [
      {
        path: 'src/a.ts',
        startLine: 1,
        endLine: 2,
        language: 'typescript',
        text: 'const a = 1;',
      },
      { path: 'src/b.ts', startLine: 7, language: 'javascript', text: 'const b = 2;' },
    ];

    expect(formatPrompt('Veja', references)).toBe(
      [
        'Veja',
        '',
        'Reference: src/a.ts:1-2 (typescript)',
        '```typescript',
        'const a = 1;',
        '```',
        '',
        'Reference: src/b.ts:7 (javascript)',
        '```javascript',
        'const b = 2;',
        '```',
      ].join('\n'),
    );
  });

  it('mostra apenas o cabeçalho quando a referência não tem texto', () => {
    expect(
      formatPrompt('Olhe', [
        { path: 'src/app.ts', startLine: 3 },
        { path: 'src/empty.ts', startLine: 1, text: '   \n\n' },
      ]),
    ).toBe(
      [
        'Olhe',
        '',
        'Reference: src/app.ts:3',
        '',
        'Reference: src/empty.ts:1',
      ].join('\n'),
    );
  });

  it('normaliza CRLF e CR nos trechos', () => {
    expect(
      formatPrompt('Revise', [
        {
          path: 'src/app.ts',
          startLine: 1,
          endLine: 2,
          language: 'typescript',
          text: 'const a = 1;\r\nconst b = 2;\r',
        },
      ]),
    ).toBe(
      [
        'Revise',
        '',
        'Reference: src/app.ts:1-2 (typescript)',
        '```typescript',
        'const a = 1;',
        'const b = 2;',
        '```',
      ].join('\n'),
    );
  });

  it('normaliza CRLF na mensagem', () => {
    expect(formatPrompt('Revise\r\nisso', [{ path: 'src/app.ts' }])).toBe(
      'Revise\nisso\n\nReference: src/app.ts',
    );
  });

  it('preserva a indentação inicial do trecho', () => {
    expect(
      formatPrompt('Veja', [
        { path: 'src/app.ts', startLine: 1, language: 'typescript', text: '    const a = 1;' },
      ]),
    ).toBe(
      [
        'Veja',
        '',
        'Reference: src/app.ts:1 (typescript)',
        '```typescript',
        '    const a = 1;',
        '```',
      ].join('\n'),
    );
  });

  it('remove as quebras de linha finais do trecho', () => {
    expect(
      formatPrompt('Veja', [{ path: 'src/app.ts', startLine: 1, text: 'linha\n\n' }]),
    ).toBe(['Veja', '', 'Reference: src/app.ts:1', '```', 'linha', '```'].join('\n'));
  });

  it('aumenta o fence quando o trecho contém crases', () => {
    expect(
      formatPrompt('Veja', [{ path: 'README.md', startLine: 1, text: '```js\ncode\n```' }]),
    ).toBe(
      [
        'Veja',
        '',
        'Reference: README.md:1',
        '````',
        '```js',
        'code',
        '```',
        '````',
      ].join('\n'),
    );
  });

  it('começa direto na referência quando a mensagem é vazia', () => {
    expect(formatPrompt('   ', [{ path: 'src/app.ts', startLine: 1 }])).toBe(
      'Reference: src/app.ts:1',
    );
  });

  it('retorna string vazia sem mensagem e sem referências', () => {
    expect(formatPrompt('', [])).toBe('');
    expect(formatPrompt('  \n  ', [])).toBe('');
  });

  it('usa heading customizado', () => {
    expect(
      formatPrompt('Veja', [{ path: 'src/app.ts', startLine: 1 }], { heading: 'Código' }),
    ).toBe('Veja\n\nCódigo: src/app.ts:1');
  });
});
