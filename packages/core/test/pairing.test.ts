import { afterEach, describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { WireError } from '../src/errors.ts';
import { pair } from '../src/pairing.ts';
import { startTestServer } from './helpers/test-server.ts';
import type { TestServer } from './helpers/test-server.ts';

const TOKEN = 'a'.repeat(64);
const servers: TestServer[] = [];

async function start(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<TestServer> {
  const server = await startTestServer(handler);
  servers.push(server);
  return server;
}

afterEach(async () => {
  const pending = servers.splice(0);
  await Promise.all(pending.map((server) => server.close()));
});

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function captureError(promise: Promise<unknown>): Promise<WireError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof WireError) {
      return error;
    }
    throw error;
  }
  throw new Error('Esperava um WireError.');
}

function validResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    token: TOKEN,
    deviceId: 'device-1',
    deviceName: 'Notebook',
    protocolVersion: 1,
    role: 'owner',
    ...overrides,
  });
}

describe('pair', () => {
  it('pareia com code, removendo espaços, e devolve as credenciais', async () => {
    let method = '';
    let url = '';
    let contentType = '';
    let body: unknown;
    const server = await start(async (req, res) => {
      method = req.method ?? '';
      url = req.url ?? '';
      contentType = req.headers['content-type'] ?? '';
      body = JSON.parse(await readBody(req));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(validResponse({ deviceName: 'Notebook da sala' }));
    });

    const credentials = await pair({
      host: server.host,
      port: server.port,
      pin: server.pin,
      deviceName: 'Notebook',
      code: ' 12 34 56 ',
    });

    expect(method).toBe('POST');
    expect(url).toBe('/pair');
    expect(contentType).toBe('application/json');
    expect(body).toEqual({ deviceName: 'Notebook', code: '123456' });
    expect(credentials).toEqual({
      host: server.host,
      port: server.port,
      pin: server.pin,
      token: TOKEN,
      deviceId: 'device-1',
      deviceName: 'Notebook da sala',
      role: 'owner',
    });
  });

  it('pareia com password', async () => {
    let body: unknown;
    const server = await start(async (req, res) => {
      body = JSON.parse(await readBody(req));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(validResponse());
    });

    const credentials = await pair({
      host: server.host,
      port: server.port,
      pin: server.pin,
      deviceName: 'Notebook',
      password: 'senha secreta',
    });

    expect(body).toEqual({ deviceName: 'Notebook', password: 'senha secreta' });
    expect(credentials.token).toBe(TOKEN);
    expect(credentials.deviceId).toBe('device-1');
    expect(credentials.role).toBe('owner');
  });

  it('exige exatamente um entre code e password', async () => {
    const server = await start((_req, res) => {
      res.end(validResponse());
    });
    const base = {
      host: server.host,
      port: server.port,
      pin: server.pin,
      deviceName: 'Notebook',
    };

    const both = await captureError(pair({ ...base, code: '123456', password: 'senha' }));
    expect(both.code).toBe('invalidRequest');

    const neither = await captureError(pair(base));
    expect(neither.code).toBe('invalidRequest');

    const blankCode = await captureError(pair({ ...base, code: '   ' }));
    expect(blankCode.code).toBe('invalidRequest');

    expect(server.requests).toBe(0);
  });

  it('rejeita protocolVersion diferente de 1', async () => {
    const server = await start((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(validResponse({ protocolVersion: 2 }));
    });

    const error = await captureError(
      pair({
        host: server.host,
        port: server.port,
        pin: server.pin,
        deviceName: 'Notebook',
        code: '123456',
      }),
    );

    expect(error.code).toBe('protocolMismatch');
  });

  it('propaga erro 401 do servidor', async () => {
    const server = await start((_req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ error: { code: 'unauthorized', message: 'Código inválido.' } }),
      );
    });

    const error = await captureError(
      pair({
        host: server.host,
        port: server.port,
        pin: server.pin,
        deviceName: 'Notebook',
        code: '123456',
      }),
    );

    expect(error.code).toBe('unauthorized');
    expect(error.status).toBe(401);
    expect(error.message).toBe('Código inválido.');
  });
});
