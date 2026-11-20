import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_VERSION,
  MAX_ACTIVITY_BYTES,
  MAX_ACTIVITY_MESSAGE,
  activityRevision,
  canonicalActivityText,
  checkActivityTarget,
  isRangeWithinDocument,
  isSafeActivityPath,
  parseActivityEvent,
  serializeActivityEvent,
} from '../src/activity.ts';
import type { ActivityErrorCode, ActivityEvent } from '../src/activity.ts';

const REVISION = 'a'.repeat(64);

function event(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    v: ACTIVITY_VERSION,
    sessionId: 's1',
    seq: 1,
    kind: 'focus',
    file: 'src/index.ts',
    range: { startLine: 10, endLine: 12 },
    revision: REVISION,
    ...over,
  };
}

function parse(payload: unknown): ActivityEvent {
  const result = parseActivityEvent(payload);
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.error.code}`);
  }
  return result.event;
}

function errorCode(payload: unknown): ActivityErrorCode {
  const result = parseActivityEvent(payload);
  if (result.ok) {
    throw new Error('expected failure');
  }
  return result.error.code;
}

describe('canonical activity text', () => {
  it('removes a leading BOM and normalizes CRLF/CR to LF', () => {
    expect(canonicalActivityText('\ufeffa\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });

  it('leaves already canonical text untouched and is idempotent', () => {
    const text = 'a\nb\n';
    expect(canonicalActivityText(text)).toBe(text);
    expect(canonicalActivityText(canonicalActivityText(text))).toBe(text);
  });

  it('does not remove a BOM that is not at the start', () => {
    expect(canonicalActivityText('a\ufeffb')).toBe('a\ufeffb');
  });
});

describe('activity revision', () => {
  it('matches the known SHA-256 of "abc"', () => {
    expect(activityRevision('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is lowercase 64 hex and equals across BOM/CRLF variants', () => {
    const revision = activityRevision('line 1\r\nline 2');
    expect(revision).toMatch(/^[0-9a-f]{64}$/);
    expect(activityRevision('\ufeffline 1\nline 2')).toBe(revision);
  });
});

describe('safe activity path', () => {
  it('accepts normalized relative POSIX paths', () => {
    for (const file of ['a.ts', 'src/a.ts', 'docs/x/y.md', '.github/workflows/ci.yml']) {
      expect(isSafeActivityPath(file)).toBe(true);
    }
  });

  it('rejects absolute, non-normalized, Windows and URI paths', () => {
    const invalid = [
      '',
      '/abs.ts',
      'C:/a.ts',
      'C:\\a.ts',
      '\\\\server\\share\\a.ts',
      'a\\b.ts',
      '../a.ts',
      'a/../b.ts',
      './a.ts',
      'a//b.ts',
      'a/',
      'file:///a.ts',
      'src/file.ts:secret',
      'a\u0000b.ts',
    ];
    for (const file of invalid) {
      expect(isSafeActivityPath(file), file).toBe(false);
    }
  });
});

describe('parseActivityEvent', () => {
  it('parses focus, decision and finish', () => {
    const focus = parse(event());
    expect(focus).toEqual({
      v: 1,
      sessionId: 's1',
      seq: 1,
      kind: 'focus',
      file: 'src/index.ts',
      range: { startLine: 10, endLine: 12 },
      revision: REVISION,
    });
    expect(Object.isFrozen(focus)).toBe(true);

    const decision = parse(event({ kind: 'decision', message: 'motivo curto' }));
    expect(decision.message).toBe('motivo curto');

    const finish = parse({ v: 1, sessionId: 's1', seq: 9, kind: 'finish' });
    expect(finish).toEqual({ v: 1, sessionId: 's1', seq: 9, kind: 'finish' });
  });

  it('ignores unknown fields', () => {
    const parsed = parse(event({ extra: 'ignored' }));
    expect(Object.keys(parsed).sort()).toEqual([
      'file',
      'kind',
      'range',
      'revision',
      'seq',
      'sessionId',
      'v',
    ]);
  });

  it('accepts a JSON string within the byte budget', () => {
    expect(parse(JSON.stringify(event())).seq).toBe(1);
  });

  it('rejects unknown versions, non-objects and broken JSON', () => {
    for (const v of [2, 0, '1']) {
      expect(errorCode(event({ v }))).toBe('unsupportedVersion');
    }
    for (const payload of [null, [], [event()], 1, true, 'null', '[]']) {
      expect(errorCode(payload)).toBe('invalidPayload');
    }
    expect(errorCode('{')).toBe('invalidJson');
  });

  it('rejects payloads over 8 KiB of UTF-8', () => {
    expect(errorCode(event({ file: `src/${'a'.repeat(MAX_ACTIVITY_BYTES)}.ts` }))).toBe(
      'payloadTooLarge',
    );
    expect(
      errorCode(JSON.stringify(event({ file: `src/${'á'.repeat(MAX_ACTIVITY_BYTES / 2)}.ts` }))),
    ).toBe('payloadTooLarge');
  });

  it('rejects invalid seq, kind and sessionId', () => {
    for (const seq of [0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
      expect(errorCode(event({ seq }))).toBe('invalidSeq');
    }
    expect(errorCode(event({ kind: 'scroll' }))).toBe('invalidKind');
    expect(errorCode(event({ sessionId: '' }))).toBe('invalidSessionId');
    expect(errorCode(event({ sessionId: '   ' }))).toBe('invalidSessionId');
  });

  it('rejects invalid ranges', () => {
    const invalid = [
      { startLine: 0, endLine: 1 },
      { startLine: 1.5, endLine: 2 },
      { startLine: 3, endLine: 2 },
      { startLine: 1 },
      null,
    ];
    for (const range of invalid) {
      expect(errorCode(event({ range }))).toBe('invalidRange');
    }
  });

  it('rejects non-canonical revisions', () => {
    for (const revision of ['A'.repeat(64), 'a'.repeat(63), 'g'.repeat(64), undefined]) {
      expect(errorCode(event({ revision }))).toBe('invalidRevision');
    }
  });

  it('caps decision messages by raw length and rejects control characters', () => {
    expect(
      parse(event({ kind: 'decision', message: 'x'.repeat(MAX_ACTIVITY_MESSAGE) })).message,
    ).toHaveLength(MAX_ACTIVITY_MESSAGE);
    expect(
      errorCode(
        event({ kind: 'decision', message: `${'x'.repeat(MAX_ACTIVITY_MESSAGE)}   ` }),
      ),
    ).toBe('invalidMessage');
    expect(errorCode(event({ kind: 'decision', message: 'a\nb' }))).toBe('invalidMessage');
    expect(errorCode(event({ kind: 'decision', message: undefined }))).toBe('invalidMessage');
  });
});

describe('serializeActivityEvent', () => {
  it('round-trips through the parser', () => {
    const parsed = parse(event());
    const serialized = serializeActivityEvent(parsed);
    expect(typeof serialized).toBe('string');
    expect(parse(serialized as string)).toEqual(parsed);
  });

  it('refuses to serialize beyond the byte budget', () => {
    const bloated = { ...parse(event()), blob: 'x'.repeat(MAX_ACTIVITY_BYTES) } as ActivityEvent;
    expect(serializeActivityEvent(bloated)).toMatchObject({
      ok: false,
      error: { code: 'payloadTooLarge' },
    });
  });
});

describe('adapter target checks', () => {
  const parsed = parse(event());
  const text = 'line 1\nline 2\n';
  const document = {
    text,
    lineCount: 2,
    isDirty: false,
  };

  it('checks ranges without clamping', () => {
    expect(isRangeWithinDocument({ startLine: 1, endLine: 2 }, 2)).toBe(true);
    expect(isRangeWithinDocument({ startLine: 2, endLine: 2 }, 2)).toBe(true);
    expect(isRangeWithinDocument({ startLine: 2, endLine: 3 }, 2)).toBe(false);
    expect(isRangeWithinDocument({ startLine: 0, endLine: 1 }, 2)).toBe(false);
  });

  it('pauses dirty documents even before comparing revisions', () => {
    expect(checkActivityTarget(parsed, { ...document, isDirty: true })).toEqual({
      ok: false,
      code: 'dirtyDocument',
    });
  });

  it('rejects ranges outside the document', () => {
    expect(
      checkActivityTarget(
        { ...parsed, range: { startLine: 20, endLine: 21 } },
        document,
      ),
    ).toEqual({ ok: false, code: 'rangeOutsideDocument' });
  });

  it('reports a stale revision when the text changed', () => {
    const inDocument = { ...parsed, range: { startLine: 1, endLine: 2 } };
    const current = parse(event({ ...inDocument, revision: activityRevision(text) }));
    expect(checkActivityTarget(current, document)).toEqual({
      ok: true,
      revision: activityRevision(text),
    });
    expect(checkActivityTarget(inDocument, document)).toEqual({
      ok: false,
      code: 'staleRevision',
    });
  });

  it('lets finish through without a file or revision', () => {
    const finish = parse({ v: 1, sessionId: 's1', seq: 9, kind: 'finish' });
    expect(checkActivityTarget(finish, { ...document, isDirty: true })).toEqual({
      ok: true,
      revision: '',
    });
  });
});
