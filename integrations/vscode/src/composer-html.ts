import { randomBytes } from 'node:crypto';
import { currentLocale } from './i18n/index.ts';

const NONCE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function composerHtml(options: {
  cspSource: string;
  nonce: string;
  scriptUri: string;
  styleUri: string;
}): string {
  const cspSource = escapeAttribute(options.cspSource);
  const nonce = escapeAttribute(options.nonce);
  const scriptUri = escapeAttribute(options.scriptUri);
  const styleUri = escapeAttribute(options.styleUri);

  return `<!DOCTYPE html>
<html lang="${escapeAttribute(currentLocale())}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}'; img-src ${cspSource} data:; font-src ${cspSource};" />
<link rel="stylesheet" href="${styleUri}" />
</head>
<body>
<main id="app"></main>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

export function createNonce(): string {
  const bytes = randomBytes(32);
  let nonce = '';
  for (const byte of bytes) {
    nonce += NONCE_CHARS.charAt(byte % NONCE_CHARS.length);
  }
  return nonce;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
