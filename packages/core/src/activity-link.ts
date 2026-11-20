import { MAX_ACTIVITY_BYTES, parseActivityEvent } from './activity.ts';
import type { ActivityErrorCode, ActivityEvent } from './activity.ts';
import { BRIDGE_EXTENSION_ID } from './show-link.ts';

export const ACTIVITY_LINK_PATH = '/activity';
export const MAX_ACTIVITY_AGENT_ID = 64;

export type ActivityLinkEvent = ActivityEvent & { agentId: string };

export type ActivityLinkErrorCode = ActivityErrorCode | 'missingEvent' | 'invalidAgentId';

export type ActivityLinkResult =
  | { ok: true; event: ActivityLinkEvent }
  | { ok: false; error: { code: ActivityLinkErrorCode; detail: string } };

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function parseActivityLink(query: string): ActivityLinkResult {
  if (Buffer.byteLength(query, 'utf8') > 65536) {
    return { ok: false, error: { code: 'payloadTooLarge', detail: 'activity query is too large' } };
  }
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const raw = params.get('event');
  if (raw === null || raw.trim() === '') {
    return { ok: false, error: { code: 'missingEvent', detail: 'event query parameter is required' } };
  }
  if (params.getAll('event').length !== 1) {
    return { ok: false, error: { code: 'invalidPayload', detail: 'event must occur exactly once' } };
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_ACTIVITY_BYTES) {
    return { ok: false, error: { code: 'payloadTooLarge', detail: 'activity event is too large' } };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return { ok: false, error: { code: 'invalidJson', detail: 'event is not valid JSON' } };
  }
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    return {
      ok: false,
      error: { code: 'invalidPayload', detail: 'event must decode to a JSON object' },
    };
  }

  const agentId = readAgentId((decoded as Record<string, unknown>).agentId);
  if (agentId === null) {
    return {
      ok: false,
      error: { code: 'invalidAgentId', detail: 'agentId is required, bounded and control-free' },
    };
  }

  const parsed = parseActivityEvent(raw);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  return { ok: true, event: Object.freeze({ ...parsed.event, agentId }) };
}

export function buildActivityLink(event: ActivityLinkEvent, scheme = 'vscode'): string {
  const params = new URLSearchParams();
  params.set('event', JSON.stringify(event));
  return `${scheme}://${BRIDGE_EXTENSION_ID}${ACTIVITY_LINK_PATH}?${params.toString()}`;
}

function readAgentId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  if (value.trim().length === 0 || value.length > MAX_ACTIVITY_AGENT_ID) {
    return null;
  }
  if (CONTROL_CHARS.test(value) || !/^[A-Za-z0-9-]+$/.test(value)) {
    return null;
  }
  return value;
}
