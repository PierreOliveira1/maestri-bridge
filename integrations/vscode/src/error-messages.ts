import { isWireError } from '@maestri-bridge/core';
import type { WireError, WireMessageId } from '@maestri-bridge/core';
import { t } from './i18n/index.ts';
import type { MessageKey } from './i18n/index.ts';

const MESSAGE_KEYS: Record<WireMessageId, MessageKey> = {
  responseTooLarge: 'errors.responseTooLarge',
  unreachable: 'errors.unreachable',
  invalidResponse: 'errors.invalidResponse',
  requestTimeout: 'errors.requestTimeout',
  invalidJsonBody: 'errors.invalidJsonBody',
  unsupportedProtocol: 'errors.unsupportedProtocol',
  emptyMessage: 'errors.emptyMessage',
  terminalNotRunning: 'errors.terminalNotRunning',
  agentNotWaiting: 'errors.agentNotWaiting',
  missingPairingSecret: 'errors.missingPairingSecret',
  invalidPin: 'errors.invalidPin',
  connectFailed: 'errors.connectFailed',
  pinUnverifiable: 'errors.pinUnverifiable',
  pinMismatch: 'errors.pinMismatch',
  connectTimeout: 'errors.connectTimeout',
};

export function describeError(error: unknown): string {
  if (!isWireError(error)) {
    return error instanceof Error ? error.message : t('errors.unexpected');
  }

  if (error.code === 'unauthorized') {
    return t('errors.unauthorized');
  }
  if (error.code === 'rateLimited') {
    return error.retryAfterSeconds === undefined
      ? t('errors.rateLimitedInstant')
      : t('errors.rateLimited', { seconds: error.retryAfterSeconds });
  }
  if (error.code === 'forbidden') {
    return t('errors.forbidden');
  }
  if (error.code === 'timeout' && error.messageId === undefined) {
    return t('errors.timeout');
  }

  if (error.messageId !== undefined) {
    return t(MESSAGE_KEYS[error.messageId], error.params);
  }

  return error.message;
}

export function describePairingError(error: unknown): string {
  if (isWireError(error)) {
    if (error.code === 'unauthorized') {
      return t('errors.pairingUnauthorized');
    }
    if (error.code === 'unavailable') {
      return t('errors.pairingUnavailable');
    }
  }

  return describeError(error);
}
