import { afterEach, describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { WireError } from '../src/errors.ts';
import { connectPinned, fetchServerKey, formatPinHex, normalizePin } from '../src/tls.ts';
import { startTestServer } from './helpers/test-server.ts';
import type { TestServer } from './helpers/test-server.ts';

const PIN_BYTES = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
const PIN_BASE64 = PIN_BYTES.toString('base64');
const PIN_HEX = PIN_BYTES.toString('hex');
const PIN_HEX_COLON = PIN_HEX.match(/.{2}/g)?.join(':') ?? '';
const PIN_HEX_COLON_UPPER = PIN_HEX_COLON.toUpperCase();

const servers: TestServer[] = [];

async function start(
  handler: (req: IncomingMessage, res: ServerResponse) => void = (_req, res) => {
    res.end();
  },
  keyType: 'rsa' | 'ec' = 'ec',
): Promise<TestServer> {
  const server = await startTestServer(handler, { keyType });
  servers.push(server);
  return server;
}

afterEach(async () => {
  const pending = servers.splice(0);
  await Promise.all(pending.map((server) => server.close()));
});

function expectInvalidPin(input: string): void {
  let caught: unknown;
  try {
    normalizePin(input);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(WireError);
  if (caught instanceof WireError) {
    expect(caught.code).toBe('invalidRequest');
  }
}

describe('normalizePin', () => {
  it('aceita hex com separadores, hex puro, base64 e prefixo sha256//', () => {
    expect(normalizePin(PIN_HEX_COLON_UPPER)).toBe(PIN_BASE64);
    expect(normalizePin(PIN_HEX_COLON)).toBe(PIN_BASE64);
    expect(normalizePin(PIN_HEX)).toBe(PIN_BASE64);
    expect(normalizePin(PIN_BASE64)).toBe(PIN_BASE64);
    expect(normalizePin(`sha256//${PIN_BASE64}`)).toBe(PIN_BASE64);
    expect(normalizePin(`  sha256//${PIN_HEX_COLON_UPPER}  `)).toBe(PIN_BASE64);
  });

  it('rejeita lixo, hex curto e base64 de 31 bytes', () => {
    expectInvalidPin('lixo');
    expectInvalidPin('');
    expectInvalidPin(PIN_HEX.slice(0, 6));
    expectInvalidPin(Buffer.alloc(31, 1).toString('base64'));
  });
});

describe('formatPinHex', () => {
  it('formata o pin em hex maiúsculo separado por dois-pontos', () => {
    expect(formatPinHex(normalizePin(PIN_HEX_COLON))).toBe(PIN_HEX_COLON_UPPER);
    expect(formatPinHex(normalizePin(PIN_BASE64))).toBe(PIN_HEX_COLON_UPPER);
  });
});

describe('fetchServerKey', () => {
  it('devolve o pin do servidor no formato base64 e hexadecimal', async () => {
    const server = await start();
    const key = await fetchServerKey({ host: server.host, port: server.port });
    expect(key.pin).toBe(server.pin);
    expect(key.hex).toBe(formatPinHex(server.pin));
    expect(key.hex).toMatch(/^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/);
  });

  it('calcula o pin sobre o SPKI também com chave RSA', async () => {
    const server = await start(undefined, 'rsa');
    const key = await fetchServerKey({ host: server.host, port: server.port });
    expect(key.pin).toBe(server.pin);
  });
});

describe('connectPinned', () => {
  it('conecta quando o pin confere', async () => {
    const server = await start();
    const result = await connectPinned({
      host: server.host,
      port: server.port,
      pin: server.pin,
    });
    expect(result.pin).toBe(server.pin);
    result.socket.end();
  });

  it('rejeita com pinMismatch quando o pin não confere', async () => {
    const server = await start();
    const wrongPin = Buffer.alloc(32, 7).toString('base64');
    expect(wrongPin).not.toBe(server.pin);
    const error = await connectPinned({
      host: server.host,
      port: server.port,
      pin: wrongPin,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WireError);
    if (error instanceof WireError) {
      expect(error.code).toBe('pinMismatch');
      expect(error.message).toBe("Maestri's security key does not match. Pair again.");
      expect(error.messageId).toBe('pinMismatch');
    }
  });
});
