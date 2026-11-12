import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { WireClient } from '../src/client.ts';
import { WireError } from '../src/errors.ts';
import type { Credentials } from '../src/types.ts';
import { startTestServer } from './helpers/test-server.ts';
import type { TestServer } from './helpers/test-server.ts';

const sample = JSON.parse(
  readFileSync(new URL('./fixtures/wire-sample.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;
const TOKEN = 'b'.repeat(64);
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

function credentialsFor(server: TestServer): Credentials {
  return {
    host: server.host,
    port: server.port,
    pin: server.pin,
    token: TOKEN,
    deviceId: 'device-1',
    deviceName: 'Teste',
    role: 'owner',
  };
}

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

describe('WireClient', () => {
  it('info envia Bearer e devolve o parse', async () => {
    let method = '';
    let url = '';
    let authorization = '';
    const server = await start((req, res) => {
      method = req.method ?? '';
      url = req.url ?? '';
      authorization = req.headers.authorization ?? '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sample.info));
    });

    const info = await new WireClient(credentialsFor(server)).info();

    expect(method).toBe('GET');
    expect(url).toBe('/api/info');
    expect(authorization).toBe(`Bearer ${TOKEN}`);
    expect(info.name).toBe('Studio');
    expect(info.protocolVersion).toBe(1);
    expect(info.capabilities).toContain('feedSnapshots');
  });

  it('rejeita protocolVersion diferente de 1', async () => {
    const server = await start((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ name: 'X', protocolVersion: 2, capabilities: [] }));
    });

    const error = await captureError(new WireClient(credentialsFor(server)).info());

    expect(error.code).toBe('protocolMismatch');
    expect(error.message).toBe('Unsupported Maestri protocol version.');
  });

  it('listWorkspaces remove os bloqueados', async () => {
    const server = await start((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sample.workspaces));
    });

    const workspaces = await new WireClient(credentialsFor(server)).listWorkspaces();

    expect(workspaces).toHaveLength(5);
    expect(workspaces.every((workspace) => !workspace.isLocked)).toBe(true);
    expect(workspaces.map((workspace) => workspace.name)).toContain('Maestri Extension');
  });

  it('getFeed codifica o id e envia floor quando informado', async () => {
    const urls: string[] = [];
    const server = await start((req, res) => {
      urls.push(req.url ?? '');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sample.feed));
    });
    const client = new WireClient(credentialsFor(server));

    const feed = await client.getFeed('A/B C');
    expect(urls[0]).toBe('/api/workspaces/A%2FB%20C/feed');
    expect(feed.terminals).toHaveLength(4);

    const ground = await client.getFeed('A/B C', 'ground');
    expect(urls[1]).toBe('/api/workspaces/A%2FB%20C/feed?floor=ground');
    expect(ground.floors[0]?.name).toBe('Ground');
  });

  it('sendPrompt envia o texto via POST', async () => {
    let method = '';
    let url = '';
    let body: unknown;
    const server = await start(async (req, res) => {
      method = req.method ?? '';
      url = req.url ?? '';
      body = JSON.parse(await readBody(req));
      res.writeHead(200);
      res.end();
    });

    await new WireClient(credentialsFor(server)).sendPrompt('t/1', 'Olá, agente');

    expect(method).toBe('POST');
    expect(url).toBe('/api/terminals/t%2F1/prompt');
    expect(body).toEqual({ text: 'Olá, agente' });
  });

  it('sendPrompt rejeita texto vazio sem fazer requisição', async () => {
    const server = await start((_req, res) => {
      res.end();
    });

    const error = await captureError(new WireClient(credentialsFor(server)).sendPrompt('t1', '   '));

    expect(error.code).toBe('invalidRequest');
    expect(error.message).toBe('The message is empty.');
    expect(error.messageId).toBe('emptyMessage');
    expect(server.requests).toBe(0);
  });

  it('sendPrompt traduz 409 em conflict', async () => {
    const server = await start((_req, res) => {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ error: { code: 'conflict', message: 'Terminal parado.' } }),
      );
    });

    const error = await captureError(
      new WireClient(credentialsFor(server)).sendPrompt('t1', 'Olá'),
    );

    expect(error.code).toBe('conflict');
    expect(error.status).toBe(409);
    expect(error.message).toBe('This terminal is not running in Maestri.');
    expect(error.messageId).toBe('terminalNotRunning');
    expect(error.cause).toBeInstanceOf(WireError);
    if (error.cause instanceof WireError) {
      expect(error.cause.status).toBe(409);
    }
  });

  it('focusTerminal faz POST no path do terminal', async () => {
    let method = '';
    let url = '';
    const server = await start((req, res) => {
      method = req.method ?? '';
      url = req.url ?? '';
      res.writeHead(200);
      res.end();
    });

    await new WireClient(credentialsFor(server)).focusTerminal('id/1');

    expect(method).toBe('POST');
    expect(url).toBe('/api/terminals/id%2F1/focus');
  });

  it('approve e reject fazem POST sem corpo', async () => {
    const requests: Array<{ method: string; url: string; body: string }> = [];
    const server = await start(async (req, res) => {
      requests.push({
        method: req.method ?? '',
        url: req.url ?? '',
        body: await readBody(req),
      });
      res.writeHead(200);
      res.end();
    });
    const client = new WireClient(credentialsFor(server));

    await client.approve('t/1');
    await client.reject('t/2');

    expect(requests).toEqual([
      { method: 'POST', url: '/api/terminals/t%2F1/approve', body: '' },
      { method: 'POST', url: '/api/terminals/t%2F2/reject', body: '' },
    ]);
  });

  it('approve traduz 409 em conflict', async () => {
    const server = await start((_req, res) => {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ error: { code: 'conflict', message: 'Nada pendente.' } }),
      );
    });

    const error = await captureError(
      new WireClient(credentialsFor(server)).approve('t1'),
    );

    expect(error.code).toBe('conflict');
    expect(error.status).toBe(409);
    expect(error.message).toBe('This agent is not waiting for an answer.');
    expect(error.cause).toBeInstanceOf(WireError);
    if (error.cause instanceof WireError) {
      expect(error.cause.status).toBe(409);
    }
  });
});
