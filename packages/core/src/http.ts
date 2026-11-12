import { ClientRequest } from 'node:http';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { isIPv6 } from 'node:net';
import { codeForStatus, WireError } from './errors.ts';
import { connectPinned } from './tls.ts';
import type { PinnedHost } from './types.ts';

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10000;

export interface WireRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  token?: string;
  json?: unknown;
  body?: Buffer;
  contentType?: string;
  timeoutMs?: number;
}

export async function wireRequest<T = unknown>(
  target: PinnedHost,
  options: WireRequestOptions,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { socket } = await connectPinned(target, { timeoutMs });
  const payload = buildPayload(options);
  const path = buildPath(options.path, options.query);
  const headers: Record<string, string> = {
    Host: formatHostHeader(target),
    Accept: 'application/json',
  };

  if (options.token !== undefined) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (payload !== undefined) {
    headers['Content-Type'] = payload.contentType;
    headers['Content-Length'] = String(payload.body.length);
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };

    const req = new ClientRequest(
      {
        method: options.method,
        path,
        createConnection: () => socket,
        headers,
      },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        let receivedBytes = 0;

        const fail = (error: WireError): void => {
          if (settled) {
            return;
          }
          settled = true;
          finish();
          res.destroy();
          req.destroy();
          reject(error);
        };

        res.on('data', (chunk: Buffer) => {
          if (settled) {
            return;
          }
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_RESPONSE_BYTES) {
            fail(
              new WireError({
                code: 'payloadTooLarge',
                message: 'The Maestri response is too large.',
                messageId: 'responseTooLarge',
              }),
            );
            return;
          }
          chunks.push(chunk);
        });

        res.on('error', (error: Error) => {
          fail(
            new WireError({
              code: 'network',
              message: `Could not reach Maestri at ${target.host}:${target.port}.`,
              messageId: 'unreachable',
              params: { host: target.host, port: target.port },
              cause: error,
            }),
          );
        });

        res.on('end', () => {
          if (settled) {
            return;
          }
          settled = true;
          finish();

          const status = res.statusCode ?? 0;
          const responseBody = Buffer.concat(chunks);
          if (status >= 200 && status < 300) {
            if (responseBody.length === 0) {
              resolve(undefined as T);
              return;
            }
            try {
              const parsed: unknown = JSON.parse(responseBody.toString('utf8'));
              resolve(parsed as T);
            } catch {
              reject(
                new WireError({
                  code: 'unknown',
                  message: 'Invalid response from Maestri.',
                  messageId: 'invalidResponse',
                }),
              );
            }
            return;
          }

          reject(errorFromResponse(status, res.headers, responseBody.toString('utf8')));
        });
      },
    );

    req.on('error', (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      finish();
      reject(
        new WireError({
          code: 'network',
          message: `Could not reach Maestri at ${target.host}:${target.port}.`,
              messageId: 'unreachable',
              params: { host: target.host, port: target.port },
          cause: error,
        }),
      );
    });

    timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      finish();
      req.destroy();
      reject(
        new WireError({
          code: 'timeout',
          message: 'Maestri took too long to respond.',
          messageId: 'requestTimeout',
        }),
      );
    }, timeoutMs);

    if (payload !== undefined) {
      req.write(payload.body);
    }
    req.end();
  });
}

interface RequestPayload {
  body: Buffer;
  contentType: string;
}

function buildPayload(options: WireRequestOptions): RequestPayload | undefined {
  if (options.json !== undefined) {
    const serialized = JSON.stringify(options.json);
    if (serialized === undefined) {
      throw new WireError({
        code: 'invalidRequest',
        message: 'Invalid JSON body.',
        messageId: 'invalidJsonBody',
      });
    }
    return { body: Buffer.from(serialized), contentType: 'application/json' };
  }
  if (options.body !== undefined) {
    return {
      body: options.body,
      contentType: options.contentType ?? 'application/octet-stream',
    };
  }
  return undefined;
}

function buildPath(
  path: string,
  query: Record<string, string | number | boolean | undefined> | undefined,
): string {
  if (query === undefined) {
    return path;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.append(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized === '' ? path : `${path}?${serialized}`;
}

function formatHostHeader(target: PinnedHost): string {
  const host = isIPv6(target.host) ? `[${target.host}]` : target.host;
  return `${host}:${target.port}`;
}

function errorFromResponse(status: number, headers: IncomingHttpHeaders, text: string): WireError {
  let code = codeForStatus(status);
  let message = `Erro ${status} do Maestri.`;
  let reason: string | undefined;

  const parsed = parseJson(text);
  if (isRecord(parsed) && isRecord(parsed.error)) {
    const envelope = parsed.error;
    if (typeof envelope.code === 'string') {
      code = envelope.code;
    }
    if (typeof envelope.message === 'string') {
      message = envelope.message;
    }
    if (typeof envelope.reason === 'string') {
      reason = envelope.reason;
    }
  }

  const retryAfterSeconds =
    status === 429 || status === 503 ? parseRetryAfter(headers['retry-after']) : undefined;

  return new WireError({ code, message, status, reason, retryAfterSeconds });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function parseRetryAfter(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) {
    return undefined;
  }
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
