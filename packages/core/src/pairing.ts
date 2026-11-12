import { WireError } from './errors.ts';
import { wireRequest } from './http.ts';
import { normalizePin } from './tls.ts';
import type { Credentials, PinnedHost } from './types.ts';

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export interface PairOptions extends PinnedHost {
  deviceName: string;
  code?: string;
  password?: string;
  deviceIdentifier?: string;
  timeoutMs?: number;
}

export async function pair(options: PairOptions): Promise<Credentials> {
  const code = options.code?.replace(/\s+/g, '');
  const password = options.password;
  const hasCode = code !== undefined && code !== '';
  const hasPassword = password !== undefined && password.trim() !== '';

  if (hasCode === hasPassword) {
    throw new WireError({
      code: 'invalidRequest',
      message: 'Provide the pairing code or the password.',
      messageId: 'missingPairingSecret',
    });
  }

  const body: Record<string, string> = { deviceName: options.deviceName };
  if (hasCode && code !== undefined) {
    body.code = code;
  }
  if (hasPassword && password !== undefined) {
    body.password = password;
  }
  if (options.deviceIdentifier !== undefined) {
    body.deviceIdentifier = options.deviceIdentifier;
  }

  const response = await wireRequest<unknown>(
    { host: options.host, port: options.port, pin: options.pin },
    {
      method: 'POST',
      path: '/pair',
      json: body,
      timeoutMs: options.timeoutMs,
    },
  );

  if (!isRecord(response)) {
    throw invalidResponse();
  }
  if (response.protocolVersion !== 1) {
    throw new WireError({
      code: 'protocolMismatch',
      message: 'Unsupported Maestri protocol version.',
      messageId: 'unsupportedProtocol',
    });
  }

  const { token, deviceId, deviceName, role } = response;
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    throw invalidResponse();
  }
  if (typeof deviceId !== 'string' || typeof deviceName !== 'string' || typeof role !== 'string') {
    throw invalidResponse();
  }

  return {
    host: options.host,
    port: options.port,
    pin: normalizePin(options.pin),
    token,
    deviceId,
    deviceName,
    role,
  };
}

function invalidResponse(): WireError {
  return new WireError({
    code: 'unknown',
    message: 'Invalid response from Maestri.',
    messageId: 'invalidResponse',
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
