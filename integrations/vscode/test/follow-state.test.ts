import { describe, expect, it } from 'vitest';
import { enqueueFollowActivity, pauseFollow, receiveFollowActivity, resumeFollow, startFollow } from '../src/follow-state.ts';
import type { FollowActivity } from '../src/follow-state.ts';

const focus = (seq: number, file = 'src/a.ts'): FollowActivity => ({
  v: 1, sessionId: 's1', agentId: 'agent1', seq, kind: 'focus', file,
  range: { startLine: 1, endLine: 2 }, revision: 'a'.repeat(64),
});

describe('follow session', () => {
  it('accepts only the chosen agent and session', () => {
    const state = startFollow('s1', 'agent1');
    expect(receiveFollowActivity(state, { ...focus(1), agentId: 'other' }).activity).toBeUndefined();
    expect(receiveFollowActivity(state, { ...focus(1), sessionId: 'old' }).state).toBe(state);
    expect(receiveFollowActivity(state, focus(1)).activity?.file).toBe('src/a.ts');
  });
  it('drops duplicates and out-of-order updates but accepts gaps', () => {
    const first = receiveFollowActivity(startFollow('s1', 'agent1'), focus(3));
    expect(receiveFollowActivity(first.state, focus(2)).activity).toBeUndefined();
    expect(receiveFollowActivity(first.state, focus(3)).activity).toBeUndefined();
    expect(receiveFollowActivity(first.state, focus(8)).state.lastSeq).toBe(8);
  });
  it('keeps only the latest location and its explanation while paused', () => {
    let state = pauseFollow(receiveFollowActivity(startFollow('s1', 'agent1'), focus(1)).state);
    state = receiveFollowActivity(state, focus(2, 'src/b.ts')).state;
    state = receiveFollowActivity(state, focus(3, 'src/c.ts')).state;
    const decision = receiveFollowActivity(state, { ...focus(4), kind: 'decision', message: 'Why' });
    expect(decision.activity).toBeUndefined();
    expect(resumeFollow(decision.state).activity).toMatchObject({ file: 'src/a.ts', message: 'Why' });
    expect(resumeFollow(decision.state).state.lastSeq).toBe(4);
  });
  it('resumes the previous confirmed focus when no event arrived during pause', () => {
    const state = receiveFollowActivity(startFollow('s1', 'agent1'), focus(1)).state;
    expect(resumeFollow(pauseFollow(state)).activity?.seq).toBe(1);
  });
  it('finish cancels pending focus and cannot be resurrected', () => {
    const state = pauseFollow(receiveFollowActivity(startFollow('s1', 'agent1'), focus(1)).state);
    const finished = receiveFollowActivity(state, { v: 1, sessionId: 's1', agentId: 'agent1', seq: 2, kind: 'finish' });
    expect(finished.state.phase).toBe('completed');
    expect(finished.state.pending).toBeUndefined();
    expect(resumeFollow(finished.state).activity).toBeUndefined();
    expect(receiveFollowActivity(finished.state, focus(3)).activity).toBeUndefined();
  });
  it('a new follow starts fresh and rejects the previous session', () => {
    const next = startFollow('s2', 'agent1');
    expect(receiveFollowActivity(next, focus(50)).state).toBe(next);
  });
  it('keeps the explanation for the same saved range across pause and focus updates', () => {
    const state = receiveFollowActivity(startFollow('s1', 'agent1'), { ...focus(1), kind: 'decision', message: 'Why' }).state;
    const resumed = resumeFollow(pauseFollow(state));
    expect(resumed.activity?.message).toBe('Why');
    const next = receiveFollowActivity(resumed.state, focus(2));
    expect(next.activity).toMatchObject({ seq: 2, kind: 'decision', message: 'Why' });
    const changed = receiveFollowActivity(next.state, { ...focus(3), revision: 'b'.repeat(64) });
    expect(changed.activity?.message).toBeUndefined();
  });

  it('keeps a queued explanation when later focus updates move to another file', () => {
    const decision = { ...focus(1), kind: 'decision', message: 'Why' } as const;
    const first = enqueueFollowActivity([], decision);
    const second = enqueueFollowActivity(first, focus(2, 'src/b.ts'));
    expect(enqueueFollowActivity(second, focus(3, 'src/c.ts'))).toEqual([decision, focus(3, 'src/c.ts')]);
  });
});
