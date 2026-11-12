import { describe, expect, it } from 'vitest';
import { composerHtml, createNonce } from '../src/composer-html.ts';

const options = {
  cspSource: 'https://cdn.example',
  nonce: 'abc123',
  scriptUri: 'https://cdn.example/composer.js',
  styleUri: 'https://cdn.example/composer.css',
};

describe('composerHtml', () => {
  it('usa o idioma, o charset e o viewport', () => {
    const html = composerHtml(options);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="pt-br">');
    expect(html).toContain('<meta charset="UTF-8" />');
    expect(html).toContain('name="viewport"');
  });

  it('monta o CSP com o nonce e o cspSource', () => {
    const html = composerHtml(options);
    expect(html).toContain(
      "default-src 'none'; style-src https://cdn.example; script-src 'nonce-abc123'; img-src https://cdn.example data:; font-src https://cdn.example;",
    );
  });

  it('liga o CSS e o script', () => {
    const html = composerHtml(options);
    expect(html).toContain('<link rel="stylesheet" href="https://cdn.example/composer.css" />');
    expect(html).toContain('<script nonce="abc123" src="https://cdn.example/composer.js"></script>');
    expect(html).toContain('<main id="app"></main>');
  });

  it('escapa os atributos', () => {
    const html = composerHtml({
      cspSource: 'https://cdn.example?a=1&b=2',
      nonce: 'abc123',
      scriptUri: 'https://cdn.example/a.js?x=1&y="2"<>',
      styleUri: 'https://cdn.example/a.css?x=1&y="2"',
    });

    expect(html).toContain(
      'style-src https://cdn.example?a=1&amp;b=2; script-src \'nonce-abc123\'; img-src https://cdn.example?a=1&amp;b=2 data:; font-src https://cdn.example?a=1&amp;b=2;',
    );
    expect(html).toContain(
      'href="https://cdn.example/a.css?x=1&amp;y=&quot;2&quot;"',
    );
    expect(html).toContain(
      'src="https://cdn.example/a.js?x=1&amp;y=&quot;2&quot;&lt;&gt;"',
    );
  });
});

describe('createNonce', () => {
  it('gera 32 caracteres alfanuméricos', () => {
    const nonce = createNonce();
    expect(nonce).toHaveLength(32);
    expect(nonce).toMatch(/^[A-Za-z0-9]{32}$/);
  });

  it('gera valores diferentes entre chamadas', () => {
    expect(createNonce()).not.toBe(createNonce());
  });
});
