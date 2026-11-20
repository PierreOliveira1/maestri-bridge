import { describe, expect, it } from 'vitest';
import { readSavedNoteTour } from '../src/note-tour-state.ts';
import type { SavedNoteStop, SavedNoteTour } from '../src/note-tour-state.ts';

const first: SavedNoteStop = {
  file: '/workspace/first.ts',
  startLine: 2,
  endLine: 5,
  agentId: 'agent-1',
  name: 'Maia',
  viewed: true,
  anchor: 'a'.repeat(64),
  comments: [
    { author: 'Maia', text: 'Review this change.', isReply: false },
    { author: 'You', text: 'Done.', isReply: true },
  ],
};

const snapshot: SavedNoteTour = {
  version: 1,
  agentKey: 'agent-1',
  currentIndex: 1,
  stops: [first, { ...first, file: '/workspace/second.ts', viewed: false }],
};

describe('readSavedNoteTour', () => {
  it('restores the checkpoint, note bodies and viewed state from JSON', () => {
    expect(readSavedNoteTour(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it('ignores missing data, an unsupported version or an out-of-range checkpoint', () => {
    for (const invalid of [
      undefined,
      { ...snapshot, version: 2 },
      { ...snapshot, currentIndex: 2 },
      { ...snapshot, currentIndex: -1 },
      { ...snapshot, stops: [] },
    ]) {
      expect(readSavedNoteTour(invalid)).toBeUndefined();
    }
  });

  it('rejects invalid ranges, reply targets, content anchors and comments', () => {
    for (const invalidStop of [
      { ...first, startLine: 0 },
      { ...first, endLine: 1 },
      { ...first, agentId: 'invalid/agent' },
      { ...first, anchor: 'bad' },
      { ...first, comments: [] },
      { ...first, comments: [{ author: 'Maia', text: false, isReply: false }] },
    ]) {
      expect(readSavedNoteTour({ ...snapshot, currentIndex: 0, stops: [invalidStop] }))
        .toBeUndefined();
    }
  });
});
