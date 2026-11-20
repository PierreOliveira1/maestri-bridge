import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/show-in-editor.sh', import.meta.url));
const env = { ...process.env };
delete env.MAESTRI_BRIDGE_EDITOR;
delete env.MAESTRI_TERMINAL_ID;

const scriptArg = script.replaceAll('\\', '/');
const isWindows = process.platform === 'win32';
const hasCygpath =
  isWindows && spawnSync('cygpath', ['-m', '/'], { encoding: 'utf8' }).status === 0;

if (isWindows && spawnSync('sh', ['-c', 'exit 0']).status !== 0) {
  throw new Error('Este teste precisa de sh no PATH (rode de um shell Git Bash/MSYS).');
}

function run(args, options = {}) {
  return spawnSync('sh', [scriptArg, ...args], { encoding: 'utf8', env, ...options });
}

function showLink(args, options) {
  const result = run(['--print', ...args], options);
  assert.equal(result.status, 0, result.stderr);
  const url = new URL(result.stdout.trim());
  return { url, params: url.searchParams };
}

const forward = (value) => value.replaceAll('\\', '/');

const base = mkdtempSync(path.join(realpathSync(tmpdir()), 'maestri show-'));
const folder = path.join(base, 'pasta teste', 'ação');
mkdirSync(folder, { recursive: true });
const file = path.join(folder, 'ção.txt');
writeFileSync(file, 'um\ndois\ntrês\n');

const nativeFile = forward(file);
const msysFile = nativeFile.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
const relativeFile = 'pasta teste/ação/ção.txt';
const note = 'nóta ção — linha 2';

after(() => rmSync(base, { recursive: true, force: true }));

test('alvo relativo com espaços e Unicode vira caminho nativo', () => {
  const { url, params } = showLink([`${relativeFile}:2`, note], { cwd: base });

  assert.equal(url.protocol, 'vscode:');
  assert.equal(url.host, 'maestri-bridge.maestri-bridge');
  assert.equal(url.pathname, '/show');
  assert.equal(params.get('file'), nativeFile);
  assert.equal(params.get('lines'), '2');
  assert.equal(params.get('text'), note);
});

test('alvo com letra de unidade mantém caminho e linhas', { skip: !isWindows }, () => {
  const { params } = showLink([`${nativeFile}:2-3`, note]);

  assert.equal(params.get('file'), nativeFile);
  assert.equal(params.get('lines'), '2-3');
  assert.equal(params.get('text'), note);
});

test('alvo no formato MSYS converge para o mesmo caminho', { skip: !hasCygpath }, () => {
  const { params } = showLink([`${msysFile}:1-1`, note]);

  assert.equal(params.get('file'), nativeFile);
  assert.equal(params.get('lines'), '1-1');
  assert.equal(params.get('text'), note);
});

test('arquivo inexistente continua falhando', () => {
  const result = run(['--print', 'nao-existe.txt'], { cwd: base });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not exist/);
  assert.equal(result.stdout, '');
});

test('opções continuam validadas', () => {
  assert.equal(run(['--print', '--editor', 'nope', relativeFile], { cwd: base }).status, 2);
  assert.equal(run(['--nope', relativeFile], { cwd: base }).status, 2);
});

test('--editor escolhe o esquema do link', () => {
  const { url } = showLink(['--editor', 'cursor', `${relativeFile}:3`], { cwd: base });

  assert.equal(url.protocol, 'cursor:');
  assert.equal(url.searchParams.get('lines'), '3');
});
