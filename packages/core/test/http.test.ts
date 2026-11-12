import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { WireError } from '../src/errors.ts';
import { wireRequest } from '../src/http.ts';
import { startTestServer } from './helpers/test-server.ts';
import type { TestServer } from './helpers/test-server.ts';

const servers: TestServer[] = [];

async function start(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<TestServer> {
  const server = await startTestServer(handler);
  servers.push(server);
  return server;
}

async function stop(server: TestServer): Promise<void> {
  const index = servers.indexOf(server);
  if (index !== -1) {
    servers.splice(index, 1);
  }
  await server.close();
}

afterEach(async () => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
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

describe('wireRequest', () => {
  it('envia GET autenticado com query codificada e devolve o JSON', async () => {
    let method = '';
    let url = '';
    let authorization = '';
    let host = '';
    const server = await start((req, res) => {
      method = req.method ?? '';
      url = req.url ?? '';
      authorization = req.headers.authorization ?? '';
      host = req.headers.host ?? '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });

    const result = await wireRequest<{ ok: boolean }>(
      { host: server.host, port: server.port, pin: server.pin },
      {
        method: 'GET',
        path: '/status',
        query: { search: 'olá mundo', limit: 10, exact: true, ignored: undefined },
        token: 'token-secreto',
      },
    );

    expect(result).toEqual({ ok: true });
    expect(method).toBe('GET');
    expect(url).toBe('/status?search=ol%C3%A1+mundo&limit=10&exact=true');
    expect(authorization).toBe('Bearer token-secreto');
    expect(host).toBe(`127.0.0.1:${server.port}`);
  });

  it('envia POST JSON com content-type, content-length e corpo', async () => {
    let contentType = '';
    let contentLength = '';
    let body: unknown;
    const server = await start(async (req, res) => {
      contentType = req.headers['content-type'] ?? '';
      contentLength = req.headers['content-length'] ?? '';
      body = JSON.parse(await readBody(req));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ created: true }));
    });

    const result = await wireRequest<{ created: boolean }>(
      { host: server.host, port: server.port, pin: server.pin },
      { method: 'POST', path: '/items', json: { name: 'Peça', count: 2 } },
    );

    expect(result).toEqual({ created: true });
    expect(contentType).toBe('application/json');
    expect(contentLength).toBe(String(Buffer.byteLength('{"name":"Peça","count":2}')));
    expect(body).toEqual({ name: 'Peça', count: 2 });
  });

  it('rejeita pin errado sem enviar nenhuma requisição', async () => {
    const server = await start((_req, res) => {
      res.end('nunca deveria chegar aqui');
    });
    const wrongPin = Buffer.alloc(32, 9).toString('base64');
    const error = await captureError(
      wireRequest(
        { host: server.host, port: server.port, pin: wrongPin },
        { method: 'GET', path: '/status' },
      ),
    );

    expect(error.code).toBe('pinMismatch');
    expect(server.requests).toBe(0);
  });

  it('converte envelope de erro 409 em WireError', async () => {
    const server = await start((_req, res) => {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: { code: 'conflict', message: 'Já existe.', reason: 'duplicate' },
        }),
      );
    });
    const error = await captureError(
      wireRequest(
        { host: server.host, port: server.port, pin: server.pin },
        { method: 'GET', path: '/items/1' },
      ),
    );

    expect(error.code).toBe('conflict');
    expect(error.status).toBe(409);
    expect(error.message).toBe('Já existe.');
    expect(error.reason).toBe('duplicate');
  });

  it('lê Retry-After em respostas 429', async () => {
    const server = await start((_req, res) => {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '30' });
      res.end(JSON.stringify({ error: { code: 'rateLimited', message: 'Calma.' } }));
    });
    const error = await captureError(
      wireRequest(
        { host: server.host, port: server.port, pin: server.pin },
        { method: 'GET', path: '/status' },
      ),
    );

    expect(error.code).toBe('rateLimited');
    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(30);
  });

  it('mapeia resposta 500 com corpo texto para internalError', async () => {
    const server = await start((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('falha interna');
    });
    const error = await captureError(
      wireRequest(
        { host: server.host, port: server.port, pin: server.pin },
        { method: 'GET', path: '/status' },
      ),
    );

    expect(error.code).toBe('internalError');
    expect(error.status).toBe(500);
    expect(error.message).toBe('Erro 500 do Maestri.');
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it('rejeita com network quando a porta está fechada', async () => {
    const server = await start((_req, res) => {
      res.end();
    });
    const port = server.port;
    await stop(server);

    const error = await captureError(
      wireRequest(
        { host: server.host, port, pin: server.pin },
        { method: 'GET', path: '/status' },
      ),
    );

    expect(error.code).toBe('network');
  });

  it('rejeita com timeout quando o servidor não responde', async () => {
    const server = await start(() => undefined);
    const error = await captureError(
      wireRequest(
        { host: server.host, port: server.port, pin: server.pin },
        { method: 'GET', path: '/lento', timeoutMs: 200 },
      ),
    );

    expect(error.code).toBe('timeout');
  });
});

describe('wireRequest com http.request interceptado', () => {
  it('não depende de http.request nem de http.get, que o VS Code substitui para aplicar proxy', async () => {
    const server = await start((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
    vi.spyOn(http, 'request').mockImplementation(() => {
      throw new Error('http.request interceptado');
    });
    vi.spyOn(http, 'get').mockImplementation(() => {
      throw new Error('http.get interceptado');
    });
    syncBuiltinESMExports();
    const result = await wireRequest(
      { host: server.host, port: server.port, pin: server.pin },
      { method: 'POST', path: '/pair', json: { a: 1 } },
    );
    expect(result).toEqual({ ok: true });
    expect(server.requests).toBe(1);
  });
});
