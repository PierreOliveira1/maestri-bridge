import { describe, expect, it } from 'vitest';
import { canSend, parseFromWebview, sendLabel } from '../src/composer-protocol.ts';
import type { ComposerReferenceView, ComposerState } from '../src/composer-protocol.ts';

function state(overrides: Partial<ComposerState> = {}): ComposerState {
  return { references: [], message: '', sending: false, isMac: false, locale: 'pt-br', ...overrides };
}

function reference(text?: string): ComposerReferenceView {
  return { id: 'ref-1', header: 'src/app.ts:1', path: 'src/app.ts', text };
}

describe('parseFromWebview', () => {
  it('aceita os tipos sem campos', () => {
    expect(parseFromWebview({ type: 'ready' })).toEqual({ type: 'ready' });
    expect(parseFromWebview({ type: 'pickAgent' })).toEqual({ type: 'pickAgent' });
    expect(parseFromWebview({ type: 'addSelection' })).toEqual({ type: 'addSelection' });
    expect(parseFromWebview({ type: 'openInMaestri' })).toEqual({ type: 'openInMaestri' });
    expect(parseFromWebview({ type: 'dismissNotice' })).toEqual({ type: 'dismissNotice' });
  });

  it('aceita removeReference com id string', () => {
    expect(parseFromWebview({ type: 'removeReference', id: 'ref-1' })).toEqual({
      type: 'removeReference',
      id: 'ref-1',
    });
  });

  it('aceita messageChanged e send com message string', () => {
    expect(parseFromWebview({ type: 'messageChanged', message: 'Oi' })).toEqual({
      type: 'messageChanged',
      message: 'Oi',
    });
    expect(parseFromWebview({ type: 'send', message: 'Oi' })).toEqual({
      type: 'send',
      message: 'Oi',
    });
  });

  it('ignora campos inválidos', () => {
    expect(parseFromWebview({ type: 'removeReference' })).toBeUndefined();
    expect(parseFromWebview({ type: 'removeReference', id: 1 })).toBeUndefined();
    expect(parseFromWebview({ type: 'messageChanged' })).toBeUndefined();
    expect(parseFromWebview({ type: 'messageChanged', message: 2 })).toBeUndefined();
    expect(parseFromWebview({ type: 'send' })).toBeUndefined();
    expect(parseFromWebview({ type: 'send', message: null })).toBeUndefined();
  });

  it('ignora valores que não são mensagens conhecidas', () => {
    expect(parseFromWebview(undefined)).toBeUndefined();
    expect(parseFromWebview(null)).toBeUndefined();
    expect(parseFromWebview('ready')).toBeUndefined();
    expect(parseFromWebview(42)).toBeUndefined();
    expect(parseFromWebview([])).toBeUndefined();
    expect(parseFromWebview({})).toBeUndefined();
    expect(parseFromWebview({ type: 'unknown' })).toBeUndefined();
  });
});

describe('canSend', () => {
  it('exige mensagem ou trecho com texto', () => {
    expect(canSend({ message: '', references: [], sending: false })).toBe(false);
    expect(canSend({ message: '   ', references: [], sending: false })).toBe(false);
    expect(canSend({ message: 'Olá', references: [], sending: false })).toBe(true);
    expect(canSend({ message: '', references: [reference('const a = 1;')], sending: false })).toBe(
      true,
    );
    expect(canSend({ message: '   ', references: [reference('   ')], sending: false })).toBe(false);
    expect(canSend({ message: '', references: [reference()], sending: false })).toBe(false);
  });

  it('bloqueia enquanto envia', () => {
    expect(canSend({ message: 'Olá', references: [], sending: true })).toBe(false);
    expect(canSend({ message: '', references: [reference('x')], sending: true })).toBe(false);
  });
});

describe('sendLabel', () => {
  it('mostra o envio em andamento', () => {
    expect(
      sendLabel(
        state({
          sending: true,
          target: { terminalName: 'Agente', workspaceName: 'Projeto' },
        }),
      ),
    ).toBe('Enviando…');
  });

  it('mostra o agente escolhido', () => {
    expect(
      sendLabel(state({ target: { terminalName: 'Agente', workspaceName: 'Projeto' } })),
    ).toBe('Enviar para Agente');
  });

  it('pede para escolher o agente', () => {
    expect(sendLabel(state())).toBe('Escolher agente e enviar');
  });
});
