import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { connect } from 'node:tls';
import type { TLSSocket } from 'node:tls';
import { WireError } from './errors.ts';
import type { HostAddress } from './types.ts';

const HEX_PIN_PATTERN = /^[0-9a-fA-F]{64}$/;
const BASE64_PIN_PATTERN = /^[A-Za-z0-9+/]{43}=$/;
const PIN_BYTES = 32;

export function pinFromSpki(spkiDer: Buffer): string {
  return createHash('sha256').update(spkiDer).digest('base64');
}

export function normalizePin(input: string): string {
  let value = input.trim();
  if (value.startsWith('sha256//')) {
    value = value.slice('sha256//'.length);
  }

  const hexCandidate = value.replace(/[\s:-]/g, '');
  if (HEX_PIN_PATTERN.test(hexCandidate)) {
    return Buffer.from(hexCandidate, 'hex').toString('base64');
  }

  const decoded = Buffer.from(value, 'base64');
  if (!BASE64_PIN_PATTERN.test(value) || decoded.length !== PIN_BYTES) {
    throw new WireError({
      code: 'invalidRequest',
      message: 'Invalid security key.',
      messageId: 'invalidPin',
    });
  }
  return decoded.toString('base64');
}

export function formatPinHex(pin: string): string {
  const bytes = Buffer.from(pin, 'base64');
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(':');
}

export function connectPinned(
  target: HostAddress & { pin?: string },
  options?: { timeoutMs?: number },
): Promise<{ socket: TLSSocket; pin: string }> {
  const timeoutMs = options?.timeoutMs ?? 5000;
  return new Promise((resolve, reject) => {
    const expectedPin = target.pin === undefined ? undefined : normalizePin(target.pin);
    const socket = connect({
      host: target.host,
      port: target.port,
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
      servername: isIP(target.host) ? undefined : target.host,
    });

    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    function cleanup(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      socket.off('error', onError);
      socket.off('secureConnect', onSecureConnect);
    }

    function fail(error: WireError): void {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      socket.destroy();
      reject(error);
    }

    function onError(error: Error): void {
      fail(
        new WireError({
          code: 'network',
          message: `Could not connect to Maestri at ${target.host}:${target.port}. Check that Maestri is open and Wire is on.`,
          messageId: 'connectFailed',
          params: { host: target.host, port: target.port },
          cause: error,
        }),
      );
    }

    function onSecureConnect(): void {
      if (settled) {
        return;
      }

      const certificate = socket.getPeerX509Certificate();
      if (certificate === undefined) {
        fail(
          new WireError({
            code: 'network',
            message: "Could not verify Maestri's security key.",
            messageId: 'pinUnverifiable',
          }),
        );
        return;
      }

      const pin = pinFromSpki(certificate.publicKey.export({ type: 'spki', format: 'der' }));
      if (expectedPin !== undefined && !pinsMatch(pin, expectedPin)) {
        fail(
          new WireError({
            code: 'pinMismatch',
            message: "Maestri's security key does not match. Pair again.",
            messageId: 'pinMismatch',
          }),
        );
        return;
      }

      settled = true;
      cleanup();
      resolve({ socket, pin });
    }

    timer = setTimeout(() => {
      fail(
        new WireError({
          code: 'timeout',
          message: 'Timed out connecting to Maestri.',
          messageId: 'connectTimeout',
        }),
      );
    }, timeoutMs);

    socket.on('error', onError);
    socket.once('secureConnect', onSecureConnect);
  });
}

export async function fetchServerKey(
  address: HostAddress,
  options?: { timeoutMs?: number },
): Promise<{ pin: string; hex: string }> {
  const { socket, pin } = await connectPinned(address, options);
  socket.end();
  return { pin, hex: formatPinHex(pin) };
}

function pinsMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, 'base64');
  const expectedBytes = Buffer.from(expected, 'base64');
  if (actualBytes.length !== expectedBytes.length) {
    return false;
  }
  return timingSafeEqual(actualBytes, expectedBytes);
}
