#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ACTIVITY_LINK_PATH = '/activity';
export const BRIDGE_EXTENSION_ID = 'maestri-bridge.maestri-bridge';
export const DEFAULT_URI_BASE = `vscode://${BRIDGE_EXTENSION_ID}${ACTIVITY_LINK_PATH}`;
export const MAX_ACTIVITY_BYTES = 8192;
export const MAX_ACTIVITY_MESSAGE = 1000;
export const MAX_ACTIVITY_AGENT_ID = 64;

const DENIED_SCHEMES = new Set([
  'about',
  'blob',
  'chrome',
  'command',
  'data',
  'edge',
  'file',
  'ftp',
  'ftps',
  'http',
  'https',
  'javascript',
  'mailto',
  'ms-settings',
  'shell',
  'tel',
  'vbscript',
]);
const EDITOR_SCHEMES = new Set(['vscode', 'vscode-insiders', 'vscodium', 'cursor', 'windsurf']);

export function canonicalActivityText(text) {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return withoutBom.replace(/\r\n?/g, '\n');
}

export function activityRevision(text) {
  return createHash('sha256').update(canonicalActivityText(text), 'utf8').digest('hex');
}

export function parseTarget(raw) {
  const match = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/.exec(raw);
  if (match === null || match[1] === '') {
    throw new Error('target must be FILE or FILE:LINE[-END]');
  }
  const startLine = match[2] === undefined ? undefined : Number(match[2]);
  const endLine = match[3] === undefined ? startLine : Number(match[3]);
  return { file: match[1], startLine, endLine };
}

export function resolveInsideRoot(root, target) {
  if (!isAllowedFile(target.file)) throw new Error('file path is invalid or sensitive');
  const realRoot = realpathSync(resolve(root));
  const absolute = resolve(realRoot, target.file);
  let realFile;
  try {
    realFile = realpathSync(absolute);
  } catch {
    throw new Error(`file not found: ${target.file}`);
  }
  const info = statSync(realFile);
  if (!info.isFile() || info.size > 1024 * 1024) {
    throw new Error('activity requires a regular text file up to 1 MiB');
  }
  const relativePath = relative(realRoot, realFile);
  if (
    relativePath === '' ||
    isAbsolute(relativePath) ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`)
  ) {
    throw new Error(`file is outside the workspace root: ${target.file}`);
  }
  const file = relativePath.split(sep).join('/');
  if (!isAllowedFile(file)) throw new Error('file path is invalid or sensitive');
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(realFile));
  if (text.includes('\0')) throw new Error('binary files cannot publish activity');
  const lineCount = canonicalActivityText(text).split('\n').length;
  return { file, absolute: realFile, text, lineCount };
}

export function resolveUriBase(base = DEFAULT_URI_BASE) {
  let url;
  try {
    url = new URL(base);
  } catch {
    throw new Error('uri base must be an absolute URI');
  }
  const scheme = url.protocol.slice(0, -1);
  if (!EDITOR_SCHEMES.has(scheme) || DENIED_SCHEMES.has(scheme)) {
    throw new Error(`uri base scheme is not an editor scheme: ${scheme}`);
  }
  if (url.username !== '' || url.password !== '' || url.port !== '') {
    throw new Error('uri base must not carry credentials or a port');
  }
  const query = url.search.startsWith('?windowId%3D') || url.search.startsWith('?windowId%3d')
    ? new URLSearchParams(decodeURIComponent(url.search.slice(1))) : url.searchParams;
  if (url.hash !== '' || [...query].some(([key, value]) => key !== 'windowId' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) || query.getAll('windowId').length > 1) {
    throw new Error('uri base may only preserve the editor windowId query');
  }
  if (url.hostname !== BRIDGE_EXTENSION_ID) {
    throw new Error(`uri base authority must be ${BRIDGE_EXTENSION_ID}`);
  }
  if (url.pathname !== ACTIVITY_LINK_PATH) {
    throw new Error(`uri base path must be ${ACTIVITY_LINK_PATH}`);
  }
  return url.toString();
}

export function buildActivityUri(event, options = {}) {
  const base = resolveUriBase(options.base ?? DEFAULT_URI_BASE);
  const params = new URLSearchParams();
  params.set('event', JSON.stringify(event));
  return `${base}${base.includes('?') ? '&' : '?'}${params.toString()}`;
}

function stateDirectory() {
  return process.env.MAESTRI_PAIR_STATE_DIR ?? join(tmpdir(), 'maestri-bridge-activity');
}

export function nextSeq(sessionId, directory = stateDirectory()) {
  mkdirSync(directory, { recursive: true });
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, '_');
  const file = join(directory, `${safe}.seq`);
  let previous = 0;
  if (existsSync(file)) {
    const parsed = Number.parseInt(readFileSync(file, 'utf8'), 10);
    previous = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
  }
  const seq = previous + 1;
  writeFileSync(file, String(seq), 'utf8');
  return seq;
}

function defaultEditorBinary() {
  const configured = process.env.MAESTRI_BRIDGE_EDITOR_BIN;
  if (configured !== undefined && configured !== '') {
    return configured;
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA;
    if (local !== undefined) {
      const candidate = join(local, 'Programs', 'Microsoft VS Code', 'Code.exe');
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return join('C:', 'Program Files', 'Microsoft VS Code', 'Code.exe');
  }
  return 'code';
}

export function openUri(uri, editorPath) {
  const binary = editorPath ?? defaultEditorBinary();
  if (!isAbsolute(binary) || !existsSync(binary)) throw new Error('pass an existing absolute editor executable with --editor-path');
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawnSync(binary, ['--open-url', uri], {
    shell: false, windowsHide: true, encoding: 'utf8', timeout: 10000, env: environment,
  });
  if (child.error || child.status !== 0) throw new Error('could not deliver the activity link to the editor');
}

function isAllowedFile(file) {
  return typeof file === 'string' && file.length > 0 && file.length <= 4096 &&
    !/[\\:\u0000-\u001f\u007f]/.test(file) && !file.startsWith('/') &&
    file.split('/').every((part) => part !== '' && part !== '.' && part !== '..' &&
      !/^(?:\.env(?:\..*)?|\.ssh|\.aws|\.gnupg|credentials(?:\..*)?|id_(?:rsa|ed25519|ecdsa)(?:\..*)?)$/i.test(part) &&
      !/\.(?:pem|key|p12|pfx)$/i.test(part));
}

function usage() {
  return [
    'usage:',
    '  emit-activity.mjs focus FILE[:LINE[-END]] [options]',
    '  emit-activity.mjs decision FILE[:LINE[-END]] NOTE|- [options]',
    '  emit-activity.mjs finish [options]',
    '',
    'options:',
    '  --session ID   session provided by Follow agent (or $MAESTRI_PAIR_SESSION)',
    '  --agent ID     declared agent id (default: $MAESTRI_TERMINAL_ID)',
    '  --root DIR     workspace root (default: $MAESTRI_BRIDGE_ROOT or cwd)',
    '  --seq N        positive sequence number; omit only for serial calls in this session',
    '  --editor-path  absolute editor executable, never a shell wrapper',
    '  --uri-base URI editor activity URI; preserves only its windowId routing parameter',
    '  --print        print the link instead of opening it',
    '',
  ].join('\n');
}

function takeOption(argv, index, name) {
  const value = argv[index + 1];
  if (value === undefined) {
    throw new Error(`${name} needs a value`);
  }
  return value;
}

export function buildEvent(argv, options = {}) {
  const positional = [];
  let sessionId;
  let agentId;
  let root = options.root ?? process.env.MAESTRI_BRIDGE_ROOT ?? process.cwd();
  let uriBase = options.base ?? DEFAULT_URI_BASE;
  let editorPath;
  let explicitSeq;
  let print = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--print') {
      print = true;
    } else if (arg === '--session') {
      sessionId = takeOption(argv, index, arg);
      index += 1;
    } else if (arg === '--agent') {
      agentId = takeOption(argv, index, arg);
      index += 1;
    } else if (arg === '--root') {
      root = takeOption(argv, index, arg);
      index += 1;
    } else if (arg === '--uri-base') {
      uriBase = takeOption(argv, index, arg);
      index += 1;
    } else if (arg === '--editor-path') {
      editorPath = takeOption(argv, index, arg);
      index += 1;
    } else if (arg === '--seq') {
      explicitSeq = Number(takeOption(argv, index, arg));
      if (!Number.isSafeInteger(explicitSeq) || explicitSeq < 1) throw new Error('seq must be a positive safe integer');
      index += 1;
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  const [kind, target, note] = positional;
  if (kind !== 'focus' && kind !== 'decision' && kind !== 'finish') {
    throw new Error('kind must be focus, decision or finish');
  }

  const resolvedAgent = agentId ?? process.env.MAESTRI_TERMINAL_ID;
  if (resolvedAgent === undefined || resolvedAgent.trim() === '') {
    throw new Error('missing agent id: pass --agent or set MAESTRI_TERMINAL_ID');
  }
  if (resolvedAgent.length > MAX_ACTIVITY_AGENT_ID || !/^[A-Za-z0-9-]+$/.test(resolvedAgent)) {
    throw new Error('agent id must be 1-64 characters without control characters');
  }

  const resolvedSession = sessionId ?? process.env.MAESTRI_PAIR_SESSION;
  if (!resolvedSession || resolvedSession.length > 200 || /[\u0000-\u0020\u007f]/.test(resolvedSession)) throw new Error('session must be provided by Follow agent');
  const seq = explicitSeq ?? options.seq ?? nextSeq(resolvedSession, options.stateDir);
  if (!Number.isSafeInteger(seq) || seq < 1) throw new Error('seq must be a positive safe integer');

  const base = { v: 1, sessionId: resolvedSession, seq, agentId: resolvedAgent };
  if (kind === 'finish') {
    return { event: { ...base, kind }, uriBase, print, editorPath };
  }

  if (target === undefined) {
    throw new Error(`${kind} needs FILE[:LINE[-END]]`);
  }
  const parsed = parseTarget(target);
  const location = resolveInsideRoot(root, parsed);
  const rangeStart = parsed.startLine ?? 1;
  const rangeEnd = parsed.endLine ?? location.lineCount;
  if (
    !Number.isSafeInteger(rangeStart) ||
    !Number.isSafeInteger(rangeEnd) ||
    rangeStart < 1 ||
    rangeEnd < rangeStart ||
    rangeEnd > location.lineCount
  ) {
    throw new Error(
      `range ${rangeStart}-${rangeEnd} is outside the document (${location.lineCount} lines)`,
    );
  }

  const event = {
    ...base,
    kind,
    file: location.file,
    range: { startLine: rangeStart, endLine: rangeEnd },
    revision: activityRevision(location.text),
  };

  if (kind === 'decision') {
    const message = note === '-' ? readFileSync(0, 'utf8') : note;
    if (message === undefined || message.trim() === '') {
      throw new Error('decision needs NOTE or - (stdin)');
    }
    if (message.length > MAX_ACTIVITY_MESSAGE) {
      throw new Error(`message exceeds ${MAX_ACTIVITY_MESSAGE} characters`);
    }
    if (/[\u0000-\u001f\u007f]/.test(message)) {
      throw new Error('message must stay in one paragraph (no control characters)');
    }
    event.message = message;
  }

  if (Buffer.byteLength(JSON.stringify(event), 'utf8') > MAX_ACTIVITY_BYTES) throw new Error('activity payload is too large');
  return { event, uriBase, print, editorPath };
}

function main(argv) {
  const { event, uriBase, print, editorPath } = buildEvent(argv);
  const uri = buildActivityUri(event, { base: uriBase });
  if (Buffer.byteLength(uri, 'utf8') > 65536) {
    throw new Error('activity link is too long');
  }
  if (print) {
    process.stdout.write(`${uri}\n`);
    return;
  }
  openUri(uri, editorPath);
}

function isEntrypoint() {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  const self = fileURLToPath(import.meta.url);
  try {
    return realpathSync(entry) === realpathSync(self);
  } catch {
    return resolve(entry) === resolve(self);
  }
}

if (isEntrypoint()) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}`);
    process.exit(1);
  }
}
