import { describe, expect, it } from 'vitest';
import { MAX_PASTED_FILE_BYTES, parseChatFromWebview } from '../src/chat-protocol.ts';

describe('parseChatFromWebview', () => {
  it('limita os controles de acompanhamento a iniciar, pausar, retomar e parar', () => {
    for (const action of ['start', 'pause', 'resume', 'stop']) {
      expect(parseChatFromWebview({ type: 'followAction', action })).toEqual({ type: 'followAction', action });
    }
    for (const action of ['approve', 'reject', 'executeCommand', '', undefined, 1]) {
      expect(parseChatFromWebview({ type: 'followAction', action })).toBeUndefined();
    }
  });
  it('aceita as ações sem campos', () => {
    expect(parseChatFromWebview({ type: 'enableChat' })).toEqual({ type: 'enableChat' });
    expect(parseChatFromWebview({ type: 'approve' })).toEqual({ type: 'approve' });
  });

  it('aceita só slots de thread de 0 a 6', () => {
    expect(parseChatFromWebview({ type: 'selectThread', slot: 3 })).toEqual({
      type: 'selectThread',
      slot: 3,
    });
    expect(parseChatFromWebview({ type: 'selectThread', slot: 7 })).toBeUndefined();
    expect(parseChatFromWebview({ type: 'clearThread', slot: 1.5 })).toBeUndefined();
  });

  it('recusa ações de entrada sem id', () => {
    expect(parseChatFromWebview({ type: 'deleteEntry', id: 'e1' })).toEqual({
      type: 'deleteEntry',
      id: 'e1',
    });
    expect(parseChatFromWebview({ type: 'deleteEntry', id: '' })).toBeUndefined();
    expect(parseChatFromWebview({ type: 'openAttachment' })).toBeUndefined();
  });

  it('abre um arquivo com o intervalo de linhas só quando o fim vem depois do início', () => {
    expect(parseChatFromWebview({ type: 'openFile', path: 'src/a.ts', line: 4, endLine: 9 })).toEqual(
      { type: 'openFile', path: 'src/a.ts', line: 4, endLine: 9 },
    );
    expect(parseChatFromWebview({ type: 'openFile', path: 'src/a.ts', line: 9, endLine: 4 })).toEqual(
      { type: 'openFile', path: 'src/a.ts', line: 9 },
    );
    expect(parseChatFromWebview({ type: 'openFile', path: ' ' })).toBeUndefined();
  });

  it('recusa arquivos colados maiores que o limite de anexos', () => {
    const base64 = 'A'.repeat(Math.ceil(((MAX_PASTED_FILE_BYTES + 1024) * 4) / 3));
    expect(
      parseChatFromWebview({ type: 'pasteFile', fileName: 'a.png', mimeType: 'image/png', base64 }),
    ).toBeUndefined();
    expect(
      parseChatFromWebview({ type: 'pasteFile', fileName: 'a.png', mimeType: 'image/png', base64: 'QUJD' }),
    ).toEqual({ type: 'pasteFile', fileName: 'a.png', mimeType: 'image/png', base64: 'QUJD' });
  });

  it('aceita texto colado só com posições válidas', () => {
    expect(parseChatFromWebview({ type: 'pasteText', text: 'a\nb', start: 2, end: 5 })).toEqual({
      type: 'pasteText',
      text: 'a\nb',
      start: 2,
      end: 5,
    });
    expect(parseChatFromWebview({ type: 'pasteText', text: 'a\nb', start: 5, end: 2 })).toBeUndefined();
    expect(parseChatFromWebview({ type: 'pasteText', text: ' ', start: 0, end: 1 })).toBeUndefined();
  });

  it('ignora mensagens desconhecidas ou malformadas', () => {
    expect(parseChatFromWebview({ type: 'runCommand' })).toBeUndefined();
    expect(parseChatFromWebview('send')).toBeUndefined();
    expect(parseChatFromWebview({ type: 'send' })).toBeUndefined();
  });
});
