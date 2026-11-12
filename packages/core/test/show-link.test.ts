import { describe, expect, it } from 'vitest';
import {
  BRIDGE_EXTENSION_ID,
  MAX_SHOW_FILE,
  MAX_SHOW_NAME,
  MAX_SHOW_TEXT,
  SHOW_LINK_PATH,
  buildShowLink,
  parseShowLink,
} from '../src/show-link.ts';
import type { ShowLinkErrorCode, ShowRequest } from '../src/show-link.ts';

function parseRequest(query: string): ShowRequest {
  const result = parseShowLink(query);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('Esperava um link válido.');
  }
  return result.request;
}

function expectError(query: string, error: ShowLinkErrorCode): void {
  expect(parseShowLink(query)).toEqual({ ok: false, error });
}

describe('constantes', () => {
  it('usa os valores combinados', () => {
    expect(SHOW_LINK_PATH).toBe('/show');
    expect(BRIDGE_EXTENSION_ID).toBe('maestri-bridge.maestri-bridge');
    expect(MAX_SHOW_TEXT).toBe(8000);
    expect(MAX_SHOW_FILE).toBe(4096);
    expect(MAX_SHOW_NAME).toBe(64);
  });
});

describe('parseShowLink', () => {
  it('lê todos os campos', () => {
    const request = parseRequest(
      '?file=src%2Fa.ts&lines=12-14&text=Ol%C3%A1%0A&agent=abc-123&from=Nina&new=1',
    );

    expect(request).toEqual({
      file: 'src/a.ts',
      startLine: 12,
      endLine: 14,
      text: 'Olá',
      agentId: 'abc-123',
      from: 'Nina',
      newTour: true,
    });
  });

  it('aceita só file e não cria chaves opcionais', () => {
    const request = parseRequest('file=src%2Fa.ts');

    expect(request).toEqual({ file: 'src/a.ts', newTour: false });
    expect('startLine' in request).toBe(false);
    expect('endLine' in request).toBe(false);
    expect('text' in request).toBe(false);
    expect('agentId' in request).toBe(false);
    expect('from' in request).toBe(false);
  });

  it('aceita query com ou sem interrogação', () => {
    expect(parseRequest('file=a.ts')).toEqual(parseRequest('?file=a.ts'));
  });

  it('lê lines nos formatos válidos', () => {
    expect(parseRequest('file=a&lines=12')).toMatchObject({
      startLine: 12,
      endLine: 12,
    });
    expect(parseRequest('file=a&lines=12-14')).toMatchObject({
      startLine: 12,
      endLine: 14,
    });
    expect(parseRequest('file=a&lines=+12+-+14+')).toMatchObject({
      startLine: 12,
      endLine: 14,
    });
    expect(parseRequest('file=a&lines=10000000')).toMatchObject({
      startLine: 10000000,
      endLine: 10000000,
    });
    expect(parseRequest('file=a&lines=1-10000000')).toMatchObject({
      startLine: 1,
      endLine: 10000000,
    });
  });

  it('ignora lines vazio', () => {
    const empty = parseRequest('file=a&lines=');
    expect('startLine' in empty).toBe(false);
    expect('endLine' in empty).toBe(false);

    const spaces = parseRequest('file=a&lines=+++');
    expect('startLine' in spaces).toBe(false);
    expect('endLine' in spaces).toBe(false);
  });

  it('normaliza quebras de linha e remove espaços das pontas do text', () => {
    const request = parseRequest(
      'file=a&text=%20linha1%0D%0Alinha2%0Dlinha3%0A%20',
    );

    expect(request.text).toBe('linha1\nlinha2\nlinha3');

    const blank = parseRequest('file=a&text=%20%0A%20');
    expect('text' in blank).toBe(false);
  });

  it('remove controles e colapsa espaços do from', () => {
    const request = parseRequest('file=a&from=%20Nina%07%20%20Costa%20');

    expect(request.from).toBe('Nina Costa');

    const blank = parseRequest('file=a&from=%07%20');
    expect('from' in blank).toBe(false);
  });

  it('faz trim em file e agent', () => {
    const request = parseRequest('file=++src%2Fa.ts++&agent=+abc-123+');

    expect(request.file).toBe('src/a.ts');
    expect(request.agentId).toBe('abc-123');
  });

  it('interpreta new sem diferenciar maiúsculas', () => {
    for (const value of ['1', 'true', 'TRUE', 'yes', 'Yes']) {
      expect(parseRequest(`file=a&new=${value}`).newTour).toBe(true);
    }
    for (const value of ['0', 'no', 'false', 'sim', '']) {
      expect(parseRequest(`file=a&new=${value}`).newTour).toBe(false);
    }
    expect(parseRequest('file=a').newTour).toBe(false);
  });

  it('rejeita file ausente ou vazio', () => {
    expectError('', 'missingFile');
    expectError('?lines=1', 'missingFile');
    expectError('file=', 'missingFile');
    expectError('file=+++', 'missingFile');
  });

  it('rejeita file longo', () => {
    expect(parseRequest(`file=${'x'.repeat(MAX_SHOW_FILE)}`).file).toHaveLength(MAX_SHOW_FILE);
    expectError(`file=${'x'.repeat(MAX_SHOW_FILE + 1)}`, 'fileTooLong');
  });

  it('rejeita lines inválido', () => {
    for (const lines of [
      '0',
      '-1',
      '1-0',
      '2-1',
      'abc',
      '1-2-3',
      '1.5',
      '1-',
      '10000001',
      '1-10000001',
    ]) {
      expectError(`file=a&lines=${lines}`, 'invalidLines');
    }
  });

  it('rejeita text longo', () => {
    expect(parseRequest(`file=a&text=${'x'.repeat(MAX_SHOW_TEXT)}`).text).toHaveLength(
      MAX_SHOW_TEXT,
    );
    expectError(`file=a&text=${'x'.repeat(MAX_SHOW_TEXT + 1)}`, 'textTooLong');
  });

  it('rejeita agent inválido', () => {
    expectError('file=a&agent=a_b', 'invalidAgent');
    expectError('file=a&agent=a.b', 'invalidAgent');
    expectError(`file=a&agent=${'a'.repeat(65)}`, 'invalidAgent');
    expect(parseRequest(`file=a&agent=${'a'.repeat(64)}`).agentId).toHaveLength(64);
    const blank = parseRequest('file=a&agent=+++');
    expect('agentId' in blank).toBe(false);
  });

  it('rejeita from longo', () => {
    expect(parseRequest(`file=a&from=${'n'.repeat(MAX_SHOW_NAME)}`).from).toHaveLength(
      MAX_SHOW_NAME,
    );
    expectError(`file=a&from=${'n'.repeat(MAX_SHOW_NAME + 1)}`, 'nameTooLong');
  });
});

describe('buildShowLink', () => {
  it('monta a URL na ordem file, lines, text, agent, from e new', () => {
    const link = buildShowLink({
      file: 'src/a.ts',
      startLine: 12,
      endLine: 14,
      text: 'Olá',
      agentId: 'abc-123',
      from: 'Nina',
      newTour: true,
    });

    expect(link.startsWith(`vscode://${BRIDGE_EXTENSION_ID}${SHOW_LINK_PATH}?`)).toBe(true);
    const url = new URL(link);
    expect([...url.searchParams.keys()]).toEqual([
      'file',
      'lines',
      'text',
      'agent',
      'from',
      'new',
    ]);
    expect(url.searchParams.get('lines')).toBe('12-14');
    expect(url.searchParams.get('new')).toBe('1');
  });

  it('usa N quando as linhas são iguais ou só há startLine', () => {
    const equal = new URL(
      buildShowLink({ file: 'a', startLine: 3, endLine: 3, newTour: false }),
    );
    expect(equal.searchParams.get('lines')).toBe('3');

    const onlyStart = new URL(
      buildShowLink({ file: 'a', startLine: 3, newTour: false }),
    );
    expect(onlyStart.searchParams.get('lines')).toBe('3');
  });

  it('inclui new apenas quando newTour é verdadeiro', () => {
    const withoutNew = new URL(buildShowLink({ file: 'a', newTour: false }));
    expect(withoutNew.searchParams.has('new')).toBe(false);

    const withNew = new URL(buildShowLink({ file: 'a', newTour: true }));
    expect(withNew.searchParams.get('new')).toBe('1');
  });

  it('faz ida e volta preservando acentos, quebras, &, =, # e espaços', () => {
    const request: ShowRequest = {
      file: 'src/pasta/a & b#c.ts',
      startLine: 3,
      endLine: 5,
      text: 'Olá, mundo!\nlinha & = # 2',
      agentId: 'abc-123',
      from: 'Nina Costa',
      newTour: true,
    };

    const link = buildShowLink(request);
    const parsed = parseShowLink(new URL(link).search);

    expect(parsed).toEqual({ ok: true, request });
  });

  it('aceita outro scheme', () => {
    const request: ShowRequest = { file: 'src/a.ts', newTour: false };
    const link = buildShowLink(request, 'cursor');

    expect(link.startsWith(`cursor://${BRIDGE_EXTENSION_ID}${SHOW_LINK_PATH}?`)).toBe(true);
    expect(parseShowLink(new URL(link).search)).toEqual({ ok: true, request });
  });
});
