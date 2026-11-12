import { createHash, X509Certificate } from 'node:crypto';
import { createServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import selfsigned from 'selfsigned';

export interface TestServer {
  host: string;
  port: number;
  pin: string;
  readonly requests: number;
  close(): Promise<void>;
}

export async function startTestServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  options: { keyType?: 'rsa' | 'ec' } = {},
): Promise<TestServer> {
  const keyType = options.keyType ?? 'ec';
  const notAfterDate = new Date();
  notAfterDate.setDate(notAfterDate.getDate() + 1);

  const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
    keyType,
    ...(keyType === 'ec' ? { curve: 'P-256' as const } : { keySize: 2048 }),
    algorithm: 'sha256',
    notAfterDate,
  });

  let requests = 0;
  const server = createServer({ key: pems.private, cert: pems.cert }, (req, res) => {
    requests += 1;
    handler(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('Não foi possível iniciar o servidor de teste.');
  }

  const certificate = new X509Certificate(pems.cert);
  const spki = certificate.publicKey.export({ type: 'spki', format: 'der' });
  const pin = createHash('sha256').update(spki).digest('base64');

  return {
    host: '127.0.0.1',
    port: address.port,
    pin,
    get requests() {
      return requests;
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
        server.closeAllConnections();
      });
    },
  };
}
