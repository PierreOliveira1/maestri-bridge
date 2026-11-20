import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_LINK_PATH,
  MAX_ACTIVITY_AGENT_ID,
  buildActivityLink,
  parseActivityLink,
} from '../src/activity-link.ts';
import type { ActivityLinkEvent } from '../src/activity-link.ts';
import { ACTIVITY_VERSION } from '../src/activity.ts';

const REVISION = 'a'.repeat(64);

function event(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: ACTIVITY_VERSION,
    sessionId: 's1',
    seq: 3,
    kind: 'focus',
    file: 'src/index.ts',
    range: { startLine: 10, endLine: 12 },
    revision: REVISION,
    agentId: 'terminal-1',
    ...over,
  };
}

function query(value: Record<string, unknown>): string {
  return `event=${encodeURIComponent(JSON.stringify(value))}`;
}

describe('parseActivityLink', () => {
  it('parses a link event and preserves agentId', () => {
    const result = parseActivityLink(query(event()));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.event.agentId).toBe('terminal-1');
    expect(result.event).toMatchObject({
      v: 1,
      sessionId: 's1',
      seq: 3,
      kind: 'focus',
      file: 'src/index.ts',
      revision: REVISION,
    });
    expect(Object.isFrozen(result.event)).toBe(true);
  });

  it('accepts a leading question mark and a URLSearchParams-style query', () => {
    expect(parseActivityLink(`?${query(event())}`).ok).toBe(true);
    const params = new URLSearchParams();
    params.set('event', JSON.stringify(event({ kind: 'finish' })));
    expect(parseActivityLink(params.toString()).ok).toBe(true);
  });

  it('requires the event parameter', () => {
    for (const value of ['', '?', 'foo=1', 'event=', 'event=%20']) {
      const result = parseActivityLink(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(['missingEvent', 'invalidJson']).toContain(result.error.code);
      }
    }
  });

  it('requires a bounded, control-free agentId', () => {
    for (const agentId of [undefined, '', '   ', 'with space', 'path/agent', 42, 'a'.repeat(MAX_ACTIVITY_AGENT_ID + 1), 'a\nb']) {
      const result = parseActivityLink(query(event({ agentId })));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('invalidAgentId');
      }
    }
  });

  it('delegates event rules to the shared activity parser', () => {
    const invalidVersion = parseActivityLink(query(event({ v: 2 })));
    expect(invalidVersion.ok).toBe(false);
    if (!invalidVersion.ok) {
      expect(invalidVersion.error.code).toBe('unsupportedVersion');
    }

    const ads = parseActivityLink(query(event({ file: 'src/file.ts:secret' })));
    expect(ads.ok).toBe(false);
    if (!ads.ok) {
      expect(ads.error.code).toBe('invalidFile');
    }

    const badMessage = parseActivityLink(
      query(event({ kind: 'decision', message: 'x'.repeat(1001) })),
    );
    expect(badMessage.ok).toBe(false);
    if (!badMessage.ok) {
      expect(badMessage.error.code).toBe('invalidMessage');
    }
  });

  it('rejects non-object JSON and broken JSON', () => {
    const array = parseActivityLink(`event=${encodeURIComponent('[1,2]')}`);
    expect(array.ok).toBe(false);

    const broken = parseActivityLink('event=%7B');
    expect(broken.ok).toBe(false);
    if (!broken.ok) {
      expect(broken.error.code).toBe('invalidJson');
    }
  });
  it('bounds encoded input and raw UTF-8 before parsing JSON and rejects duplicate events', () => {
    for (const value of ['event=' + 'a'.repeat(65536), 'event=' + encodeURIComponent('ç'.repeat(5000))]) {
      const result = parseActivityLink(value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('payloadTooLarge');
    }
    const duplicate = parseActivityLink(query(event()) + '&' + query(event()));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.code).toBe('invalidPayload');
  });
});

describe('buildActivityLink', () => {
  it('builds an encoded /activity link', () => {
    const event: ActivityLinkEvent = {
      v: 1,
      sessionId: 's1',
      seq: 1,
      kind: 'decision',
      file: 'src/a b.ts',
      range: { startLine: 1, endLine: 1 },
      revision: REVISION,
      message: 'linha com espaço e símbolos #?',
      agentId: 'terminal-1',
    };
    const link = buildActivityLink(event);
    expect(link.startsWith(`vscode://maestri-bridge.maestri-bridge${ACTIVITY_LINK_PATH}?event=`)).toBe(
      true,
    );
    expect(link).not.toContain(' ');
    expect(link).not.toContain('\n');

    const query = link.slice(link.indexOf('?') + 1);
    const roundTrip = parseActivityLink(query);
    expect(roundTrip.ok).toBe(true);
    if (roundTrip.ok) {
      expect(roundTrip.event).toEqual(event);
    }
  });

  it('honours the scheme argument', () => {
    const link = buildActivityLink(
      { v: 1, sessionId: 's', seq: 1, kind: 'finish', agentId: 'a' },
      'cursor',
    );
    expect(link.startsWith('cursor://maestri-bridge.maestri-bridge/activity?')).toBe(true);
  });
});
