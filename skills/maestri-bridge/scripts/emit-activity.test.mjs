import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_URI_BASE,
  activityRevision,
  buildActivityUri,
  buildEvent,
  canonicalActivityText,
  nextSeq,
  parseTarget,
  resolveInsideRoot,
  resolveUriBase,
} from './emit-activity.mjs';

const EMITTER = fileURLToPath(new URL('./emit-activity.mjs', import.meta.url));

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'maestri-emit-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'a.ts'), 'line 1\r\nline 2\nline 3\n', 'utf8');
  writeFileSync(join(root, '..', `outside-${process.pid}.ts`), 'outside\n', 'utf8');
  return root;
}

function parseUri(uri) {
  const params = new URLSearchParams(uri.slice(uri.indexOf('?') + 1));
  return JSON.parse(params.get('event'));
}

test('canonical text and revision match the core contract', () => {
  assert.equal(canonicalActivityText('\ufeffa\r\nb\rc'), 'a\nb\nc');
  assert.equal(
    activityRevision('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal(activityRevision('\ufeffabc\r\n'), activityRevision('abc\n'));
});

test('parseTarget handles FILE, FILE:LINE and FILE:START-END', () => {
  assert.deepEqual(parseTarget('src/a.ts'), {
    file: 'src/a.ts',
    startLine: undefined,
    endLine: undefined,
  });
  assert.deepEqual(parseTarget('src/a.ts:7'), { file: 'src/a.ts', startLine: 7, endLine: 7 });
  assert.deepEqual(parseTarget('src/a.ts:7-9'), { file: 'src/a.ts', startLine: 7, endLine: 9 });
});

test('resolveInsideRoot rejects escapes and keeps a POSIX relative path', () => {
  const root = workspace();
  const inside = resolveInsideRoot(root, { file: 'src/a.ts' });
  assert.equal(inside.file, 'src/a.ts');
  assert.match(inside.revisionText ?? activityRevision(inside.text), /^[0-9a-f]{64}$/);
  assert.equal(inside.lineCount, 4, 'trailing newline keeps the empty last line, like VS Code');

  assert.throws(
    () => resolveInsideRoot(root, { file: `../outside-${process.pid}.ts` }),
    /outside the workspace|invalid or sensitive/,
  );
  assert.throws(() => resolveInsideRoot(root, { file: 'src/missing.ts' }), /not found/);
});

test('nextSeq increments and persists per session', () => {
  const directory = mkdtempSync(join(tmpdir(), 'maestri-seq-'));
  assert.equal(nextSeq('s1', directory), 1);
  assert.equal(nextSeq('s1', directory), 2);
  assert.equal(nextSeq('s2', directory), 1);
});

test('buildEvent builds a focus event without shell or extra options', () => {
  const root = workspace();
  const { event, uriBase, print } = buildEvent(
    ['focus', 'src/a.ts:1-2', '--agent', 'term-1', '--session', 's1', '--print'],
    { root, seq: 4 },
  );
  assert.equal(uriBase, DEFAULT_URI_BASE);
  assert.equal(print, true);
  assert.equal(event.v, 1);
  assert.equal(event.sessionId, 's1');
  assert.equal(event.seq, 4);
  assert.equal(event.agentId, 'term-1');
  assert.equal(event.kind, 'focus');
  assert.equal(event.file, 'src/a.ts');
  assert.deepEqual(event.range, { startLine: 1, endLine: 2 });
  assert.equal(event.revision, activityRevision('line 1\r\nline 2\nline 3\n'));
});

test('buildEvent rejects ranges outside the document', () => {
  const root = workspace();
  assert.throws(
    () => buildEvent(['focus', 'src/a.ts:2-9', '--agent', 't', '--session', 's'], { root }),
    /outside the document/,
  );
});

test('buildEvent requires an agent id', () => {
  const root = workspace();
  const previous = process.env.MAESTRI_TERMINAL_ID;
  delete process.env.MAESTRI_TERMINAL_ID;
  try {
    assert.throws(() => buildEvent(['focus', 'src/a.ts', '--session', 's'], { root }), /agent id/);
  } finally {
    if (previous !== undefined) {
      process.env.MAESTRI_TERMINAL_ID = previous;
    }
  }
});

test('buildActivityUri carries an encoded event and round-trips', () => {
  const event = {
    v: 1,
    sessionId: 's1',
    seq: 1,
    kind: 'decision',
    file: 'src/a b.ts',
    range: { startLine: 1, endLine: 1 },
    revision: 'a'.repeat(64),
    message: 'escolha #1',
    agentId: 'term-1',
  };
  const uri = buildActivityUri(event);
  assert.ok(uri.startsWith('vscode://maestri-bridge.maestri-bridge/activity?event='));
  assert.ok(!uri.includes(' '));
  assert.deepEqual(parseUri(uri), event);
});

test('CLI --print emits a parseable link with revision and seq', () => {
  const root = workspace();
  const state = mkdtempSync(join(tmpdir(), 'maestri-state-'));
  const run = spawnSync(
    process.execPath,
    [
      EMITTER,
      'decision',
      'src/a.ts:2',
      'decisão curta',
      '--root',
      root,
      '--agent',
      'term-1',
      '--session',
      's1',
      '--print',
    ],
    { encoding: 'utf8', env: { ...process.env, MAESTRI_PAIR_STATE_DIR: state } },
  );
  assert.equal(run.status, 0, run.stderr);
  const event = parseUri(run.stdout.trim());
  assert.equal(event.kind, 'decision');
  assert.equal(event.message, 'decisão curta');
  assert.equal(event.seq, 1);
  assert.equal(event.agentId, 'term-1');
  assert.equal(event.revision, activityRevision('line 1\r\nline 2\nline 3\n'));

  const finish = spawnSync(
    process.execPath,
    [EMITTER, 'finish', '--agent', 'term-1', '--session', 's1', '--print'],
    { encoding: 'utf8', env: { ...process.env, MAESTRI_PAIR_STATE_DIR: state } },
  );
  assert.equal(finish.status, 0, finish.stderr);
  const done = parseUri(finish.stdout.trim());
  assert.deepEqual({ kind: done.kind, seq: done.seq }, { kind: 'finish', seq: 2 });
});

test('CLI fails with a clear message on bad input', () => {
  const root = workspace();
  const run = spawnSync(
    process.execPath,
    [EMITTER, 'focus', 'src/a.ts:9-10', '--agent', 't', '--session', 's', '--print'],
    { encoding: 'utf8', env: { ...process.env, MAESTRI_BRIDGE_ROOT: root } },
  );
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /outside the document/);
});

test('resolveUriBase accepts editor bases and rejects unsafe ones', () => {
  assert.equal(resolveUriBase(), DEFAULT_URI_BASE);
  for (const base of [
    'vscode-insiders://maestri-bridge.maestri-bridge/activity',
    'vscodium://maestri-bridge.maestri-bridge/activity',
    'cursor://maestri-bridge.maestri-bridge/activity',
  ]) {
    assert.equal(resolveUriBase(base), base);
  }
  const invalid = [
    'vscode://maestri-bridge.maestri-bridge/show',
    'vscode://other.extension/activity',
    'vscode://maestri-bridge.maestri-bridge/activity?x=1',
    'vscode://maestri-bridge.maestri-bridge/activity#x',
    'vscode://maestri-bridge.maestri-bridge:80/activity',
    'vscode://user:pass@maestri-bridge.maestri-bridge/activity',
    'https://maestri-bridge.maestri-bridge/activity',
    'file://maestri-bridge.maestri-bridge/activity',
    'not a uri',
  ];
  for (const base of invalid) {
    assert.throws(() => resolveUriBase(base), base);
  }
});

test('buildActivityUri honours an explicit base', () => {
  const event = { v: 1, sessionId: 's', seq: 1, kind: 'finish', agentId: 'a' };
  const uri = buildActivityUri(event, { base: 'cursor://maestri-bridge.maestri-bridge/activity' });
  assert.ok(uri.startsWith('cursor://maestri-bridge.maestri-bridge/activity?event='));
  assert.throws(
    () => buildActivityUri(event, { base: 'vscode://maestri-bridge.maestri-bridge/show' }),
    /path/,
  );
});

test('CLI accepts --uri-base for an alternate editor scheme', () => {
  const run = spawnSync(
    process.execPath,
    [
      EMITTER,
      'finish',
      '--agent',
      'term-1',
      '--session',
      's-base',
      '--print',
      '--uri-base',
      'vscode-insiders://maestri-bridge.maestri-bridge/activity',
    ],
    { encoding: 'utf8', env: { ...process.env, MAESTRI_PAIR_STATE_DIR: mkdtempSync(join(tmpdir(), 'maestri-state-')) } },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.startsWith('vscode-insiders://maestri-bridge.maestri-bridge/activity?event='));
});

test('producer refuses sensitive, binary, oversized files and raw message overflow', () => {
  const root = workspace();
  writeFileSync(join(root, '.env.local'), 'SECRET=value');
  writeFileSync(join(root, 'src', 'binary.ts'), Buffer.from([0, 1, 2]));
  writeFileSync(join(root, 'src', 'large.ts'), Buffer.alloc(1024 * 1024 + 1));
  writeFileSync(join(root, 'src', 'invalid.ts'), Buffer.from([0xff, 0xfe, 0xff]));
  const options = { root, seq: 1 };
  const args = ['--session', 's1', '--agent', 'agent1', '--print'];
  for (const file of ['.env.local', 'src/binary.ts', 'src/large.ts', 'src/invalid.ts']) {
    assert.throws(() => buildEvent(['focus', file, ...args], options), file);
  }
  assert.throws(() => buildEvent(['decision', 'src/a.ts', 'x'.repeat(1000) + ' ', ...args], options), /exceeds/);
});

test('CLI honors explicit sequence and executable without executing it in print mode', () => {
  const run = spawnSync(process.execPath, [EMITTER, 'finish', '--session', 's1', '--agent', 'agent1', '--seq', '42', '--editor-path', '/does/not/run', '--print'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(parseUri(run.stdout.trim()).seq, 42);
  assert.throws(() => buildEvent(['finish', '--session', 's1', '--agent', 'agent1', '--seq', '0']), /seq/);
});

test('preserves the routing windowId returned by VS Code asExternalUri', () => {
  const base = 'vscode://maestri-bridge.maestri-bridge/activity?windowId=14';
  const uri = buildActivityUri({ v: 1, sessionId: 's', agentId: 'a', seq: 1, kind: 'finish' }, { base });
  assert.equal(new URL(uri).searchParams.get('windowId'), '14');
  assert.equal(parseUri(uri).kind, 'finish');
  assert.throws(() => resolveUriBase(base + '&windowId=15'));
  const encodedBase = 'vscode://maestri-bridge.maestri-bridge/activity?windowId%3D14';
  const encoded = buildActivityUri({ v: 1, sessionId: 's', agentId: 'a', seq: 1, kind: 'finish' }, { base: encodedBase });
  assert.ok(encoded.startsWith(encodedBase + '&event='));
  assert.equal(parseUri(encoded).kind, 'finish');
});
