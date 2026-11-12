import { describe, expect, it } from 'vitest';
import { WireError } from '@maestri-bridge/core';
import { describeError, describePairingError } from '../src/error-messages.ts';

function wireError(
  code: string,
  message: string,
  retryAfterSeconds?: number,
): WireError {
  return new WireError({ code, message, retryAfterSeconds });
}

describe('describeError', () => {
  it('usa a mensagem de erro de rede', () => {
    expect(describeError(wireError('network', 'Falha de rede.'))).toBe('Falha de rede.');
  });

  it('traduz um erro com messageId e params', () => {
    const error = new WireError({
      code: 'network',
      message: 'connect ECONNREFUSED',
      messageId: 'connectFailed',
      params: { host: 'localhost', port: 7434 },
    });
    expect(describeError(error)).toBe(
      'Não foi possível conectar ao Maestri em localhost:7434. Verifique se o Maestri está aberto e o Wire ativo.',
    );
  });

  it('usa error.message quando não há messageId', () => {
    expect(describeError(wireError('pinMismatch', 'A chave mudou.'))).toBe('A chave mudou.');
  });

  it('traduz credencial recusada', () => {
    expect(describeError(wireError('unauthorized', 'Não autorizado.'))).toBe(
      'O Maestri recusou a credencial. Pareie novamente (Maestri: Parear com o Maestri).',
    );
  });

  it('usa a mensagem de chave divergente', () => {
    expect(describeError(wireError('pinMismatch', 'A chave de segurança do Maestri não confere.'))).toBe(
      'A chave de segurança do Maestri não confere.',
    );
  });

  it('traduz limite de tentativas com e sem Retry-After', () => {
    expect(describeError(wireError('rateLimited', 'Muitas requisições.', 30))).toBe(
      'Muitas tentativas. Tente de novo em 30 s.',
    );
    expect(describeError(wireError('rateLimited', 'Muitas requisições.'))).toBe(
      'Muitas tentativas. Tente de novo em instantes.',
    );
  });

  it('traduz tempo esgotado', () => {
    expect(describeError(wireError('timeout', 'Tempo esgotado.'))).toBe(
      'O Maestri demorou para responder. Tente de novo.',
    );
  });

  it('traduz acesso proibido', () => {
    expect(describeError(wireError('forbidden', 'Proibido.'))).toBe(
      'Este dispositivo não tem permissão para isso (pareado como convidado?).',
    );
  });

  it('usa a mensagem de outros erros do Wire', () => {
    expect(describeError(wireError('notFound', 'Não encontrado.'))).toBe('Não encontrado.');
  });

  it('usa a mensagem de um Error comum', () => {
    expect(describeError(new Error('Deu ruim.'))).toBe('Deu ruim.');
  });

  it('usa a mensagem padrão para valores desconhecidos', () => {
    expect(describeError('texto')).toBe('Erro inesperado.');
    expect(describeError(undefined)).toBe('Erro inesperado.');
  });
});

describe('describePairingError', () => {
  it('traduz credencial recusada no pareamento', () => {
    expect(describePairingError(wireError('unauthorized', 'Não autorizado.'))).toBe(
      'Código ou senha inválidos. O código vale 5 minutos e só funciona com a aba Pareamento aberta.',
    );
  });

  it('traduz pareamento por senha desligado', () => {
    expect(describePairingError(wireError('unavailable', 'Indisponível.'))).toBe(
      'O pareamento por senha está desligado no Maestri. Use o código da aba Pareamento.',
    );
  });

  it('usa describeError para os demais erros', () => {
    expect(describePairingError(wireError('network', 'Falha de rede.'))).toBe('Falha de rede.');
    expect(describePairingError(wireError('timeout', 'Tempo esgotado.'))).toBe(
      'O Maestri demorou para responder. Tente de novo.',
    );
    expect(describePairingError(new Error('Deu ruim.'))).toBe('Deu ruim.');
  });
});
