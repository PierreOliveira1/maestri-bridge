import { createHash } from 'node:crypto';

export const ACTIVITY_VERSION = 1;
export const MAX_ACTIVITY_BYTES = 8192;
export const MAX_ACTIVITY_MESSAGE = 1000;
export const MAX_ACTIVITY_SESSION_ID = 200;
export const MAX_ACTIVITY_FILE = 4096;
export const MAX_ACTIVITY_LINE = 10000000;
export const ACTIVITY_REVISION_PATTERN = /^[0-9a-f]{64}$/;

export type ActivityKind = 'focus' | 'decision' | 'finish';

export interface ActivityRange {
  startLine: number;
  endLine: number;
}

export interface ActivityEvent {
  v: typeof ACTIVITY_VERSION;
  sessionId: string;
  seq: number;
  kind: ActivityKind;
  file?: string;
  range?: ActivityRange;
  revision?: string;
  message?: string;
}

export type ActivityErrorCode =
  | 'unsupportedVersion'
  | 'payloadTooLarge'
  | 'invalidPayload'
  | 'invalidJson'
  | 'invalidSessionId'
  | 'invalidSeq'
  | 'invalidKind'
  | 'invalidFile'
  | 'invalidRange'
  | 'invalidRevision'
  | 'invalidMessage';

export interface ActivityFailure {
  ok: false;
  error: { code: ActivityErrorCode; detail: string };
}

export type ActivityParseResult = { ok: true; event: ActivityEvent } | ActivityFailure;

export interface ActivityDocumentState {
  text: string;
  lineCount: number;
  isDirty: boolean;
}

export type ActivityTargetCode =
  | 'dirtyDocument'
  | 'rangeOutsideDocument'
  | 'staleRevision'
  | 'invalidEvent';

export type ActivityTargetResult =
  | { ok: true; revision: string }
  | { ok: false; code: ActivityTargetCode };

const KINDS: readonly ActivityKind[] = ['focus', 'decision', 'finish'];

function fail(code: ActivityErrorCode, detail: string): ActivityFailure {
  return { ok: false, error: { code, detail } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isSafeInteger(value) && value > 0;
}

function hasControlChars(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

export function canonicalActivityText(text: string): string {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return withoutBom.replace(/\r\n?/g, '\n');
}

export function activityRevision(text: string): string {
  return createHash('sha256').update(canonicalActivityText(text), 'utf8').digest('hex');
}

export function isSafeActivityPath(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  if (value.length === 0 || value.length > MAX_ACTIVITY_FILE) {
    return false;
  }
  if (hasControlChars(value) || value.includes('\\')) {
    return false;
  }
  if (value.includes(':')) {
    return false;
  }
  if (value.startsWith('/')) {
    return false;
  }
  const segments = value.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function parseRange(value: unknown): ActivityRange | ActivityFailure {
  if (!isPlainObject(value)) {
    return fail('invalidRange', 'range must be an object');
  }
  const { startLine, endLine } = value;
  if (!isPositiveInteger(startLine) || !isPositiveInteger(endLine)) {
    return fail('invalidRange', 'startLine and endLine must be positive safe integers');
  }
  if (startLine > MAX_ACTIVITY_LINE || endLine > MAX_ACTIVITY_LINE) {
    return fail('invalidRange', 'line numbers exceed the supported limit');
  }
  if (endLine < startLine) {
    return fail('invalidRange', 'endLine must be greater than or equal to startLine');
  }
  return Object.freeze({ startLine, endLine });
}

function isFailure(value: ActivityRange | ActivityFailure): value is ActivityFailure {
  return (value as ActivityFailure).ok === false;
}

function parseLabel(
  value: unknown,
  code: ActivityErrorCode,
  label: string,
  maxLength: number,
): string | ActivityFailure {
  if (typeof value !== 'string') {
    return fail(code, `${label} must be a string`);
  }
  if (value.trim().length === 0) {
    return fail(code, `${label} must not be blank`);
  }
  if (value.length > maxLength) {
    return fail(code, `${label} is too long`);
  }
  if (hasControlChars(value)) {
    return fail(code, `${label} must not contain control characters`);
  }
  return value;
}

export function parseActivityEvent(payload: unknown): ActivityParseResult {
  let value: unknown = payload;

  if (typeof payload === 'string') {
    if (byteLength(payload) > MAX_ACTIVITY_BYTES) {
      return fail('payloadTooLarge', `payload exceeds ${MAX_ACTIVITY_BYTES} UTF-8 bytes`);
    }
    try {
      value = JSON.parse(payload);
    } catch {
      return fail('invalidJson', 'payload is not valid JSON');
    }
  } else if (isPlainObject(payload)) {
    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(payload);
    } catch {
      return fail('invalidPayload', 'payload must be JSON serializable');
    }
    if (typeof serialized !== 'string') {
      return fail('invalidPayload', 'payload serialization must produce JSON text');
    }
    if (byteLength(serialized) > MAX_ACTIVITY_BYTES) {
      return fail('payloadTooLarge', `payload exceeds ${MAX_ACTIVITY_BYTES} UTF-8 bytes`);
    }
  } else {
    return fail('invalidPayload', 'payload must be a JSON object or JSON string');
  }

  if (!isPlainObject(value)) {
    return fail('invalidPayload', 'payload must decode to a JSON object');
  }

  if (value.v !== ACTIVITY_VERSION) {
    return fail('unsupportedVersion', `expected v:${ACTIVITY_VERSION}`);
  }

  const sessionId = parseLabel(
    value.sessionId,
    'invalidSessionId',
    'sessionId',
    MAX_ACTIVITY_SESSION_ID,
  );
  if (typeof sessionId !== 'string') {
    return sessionId;
  }

  if (!isPositiveInteger(value.seq)) {
    return fail('invalidSeq', 'seq must be a positive safe integer');
  }

  if (typeof value.kind !== 'string' || !KINDS.includes(value.kind as ActivityKind)) {
    return fail('invalidKind', 'kind must be one of focus, decision, finish');
  }
  const kind = value.kind as ActivityKind;

  if (kind === 'finish') {
    return {
      ok: true,
      event: Object.freeze({
        v: ACTIVITY_VERSION,
        sessionId,
        seq: value.seq,
        kind,
      }),
    };
  }

  if (!isSafeActivityPath(value.file)) {
    return fail('invalidFile', 'file must be a normalized relative POSIX path');
  }

  const range = parseRange(value.range);
  if (isFailure(range)) {
    return range;
  }

  if (typeof value.revision !== 'string' || !ACTIVITY_REVISION_PATTERN.test(value.revision)) {
    return fail('invalidRevision', 'revision must be 64 lowercase hex characters');
  }

  if (kind === 'decision') {
    const message = parseLabel(
      value.message,
      'invalidMessage',
      'message',
      MAX_ACTIVITY_MESSAGE,
    );
    if (typeof message !== 'string') {
      return message;
    }
    return {
      ok: true,
      event: Object.freeze({
        v: ACTIVITY_VERSION,
        sessionId,
        seq: value.seq,
        kind,
        file: value.file,
        range,
        revision: value.revision,
        message,
      }),
    };
  }

  return {
    ok: true,
    event: Object.freeze({
      v: ACTIVITY_VERSION,
      sessionId,
      seq: value.seq,
      kind,
      file: value.file,
      range,
      revision: value.revision,
    }),
  };
}

export function serializeActivityEvent(event: ActivityEvent): string | ActivityFailure {
  const serialized = JSON.stringify(event);
  if (byteLength(serialized) > MAX_ACTIVITY_BYTES) {
    return fail('payloadTooLarge', `payload exceeds ${MAX_ACTIVITY_BYTES} UTF-8 bytes`);
  }
  return serialized;
}

export function isRangeWithinDocument(range: ActivityRange, lineCount: number): boolean {
  return (
    Number.isSafeInteger(lineCount) &&
    range.startLine >= 1 &&
    range.endLine >= range.startLine &&
    range.endLine <= lineCount
  );
}

export function checkActivityTarget(
  event: ActivityEvent,
  document: ActivityDocumentState,
): ActivityTargetResult {
  if (event.kind === 'finish') {
    return { ok: true, revision: '' };
  }
  if (event.file === undefined || event.range === undefined || event.revision === undefined) {
    return { ok: false, code: 'invalidEvent' };
  }
  if (document.isDirty) {
    return { ok: false, code: 'dirtyDocument' };
  }
  if (!isRangeWithinDocument(event.range, document.lineCount)) {
    return { ok: false, code: 'rangeOutsideDocument' };
  }
  const revision = activityRevision(document.text);
  if (revision !== event.revision) {
    return { ok: false, code: 'staleRevision' };
  }
  return { ok: true, revision };
}
