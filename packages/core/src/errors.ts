export type WireErrorCode =
  | 'invalidRequest'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'preconditionFailed'
  | 'payloadTooLarge'
  | 'rateLimited'
  | 'internalError'
  | 'unavailable'
  | 'unknown'
  | 'pinMismatch'
  | 'network'
  | 'timeout'
  | 'protocolMismatch'
  | (string & {});

export type WireMessageId =
  | 'responseTooLarge'
  | 'unreachable'
  | 'invalidResponse'
  | 'requestTimeout'
  | 'invalidJsonBody'
  | 'unsupportedProtocol'
  | 'emptyMessage'
  | 'terminalNotRunning'
  | 'agentNotWaiting'
  | 'missingPairingSecret'
  | 'invalidPin'
  | 'connectFailed'
  | 'pinUnverifiable'
  | 'pinMismatch'
  | 'connectTimeout';

export type WireMessageParams = Readonly<Record<string, string | number>>;

export interface WireErrorOptions {
  code: WireErrorCode;
  message: string;
  messageId?: WireMessageId;
  params?: WireMessageParams;
  status?: number;
  reason?: string;
  retryAfterSeconds?: number;
  cause?: unknown;
}

export class WireError extends Error {
  readonly code: WireErrorCode;
  readonly messageId?: WireMessageId;
  readonly params?: WireMessageParams;
  status?: number;
  reason?: string;
  retryAfterSeconds?: number;

  constructor(options: WireErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'WireError';
    this.code = options.code;
    this.messageId = options.messageId;
    this.params = options.params;
    this.status = options.status;
    this.reason = options.reason;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function isWireError(error: unknown): error is WireError {
  return error instanceof WireError;
}

export function codeForStatus(status: number): WireErrorCode {
  switch (status) {
    case 400:
      return 'invalidRequest';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'notFound';
    case 409:
      return 'conflict';
    case 412:
      return 'preconditionFailed';
    case 413:
      return 'payloadTooLarge';
    case 415:
      return 'invalidRequest';
    case 429:
      return 'rateLimited';
    case 500:
      return 'internalError';
    case 503:
      return 'unavailable';
    default:
      return 'unknown';
  }
}
