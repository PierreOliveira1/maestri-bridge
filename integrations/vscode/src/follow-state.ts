import type { ActivityEvent } from '@maestri-bridge/core';

export interface FollowActivity extends ActivityEvent {
  agentId: string;
}

export interface FollowState {
  sessionId: string;
  agentId: string;
  phase: 'following' | 'paused' | 'completed';
  lastSeq: number;
  focus?: FollowActivity;
  pending?: FollowActivity;
}

export interface FollowSummary {
  agentId: string;
  name: string;
  phase: FollowState['phase'];
  workspaceName?: string;
  rootPath?: string;
  file?: string;
  note?: { file: string; startLine: number; endLine: number; message: string };
}

export function sameFollowLocation(first: FollowActivity, second: FollowActivity): boolean {
  return first.sessionId === second.sessionId && first.file === second.file &&
    first.revision === second.revision && first.range?.startLine === second.range?.startLine &&
    first.range?.endLine === second.range?.endLine;
}

export function enqueueFollowActivity(queue: readonly FollowActivity[], event: FollowActivity): FollowActivity[] {
  if (event.kind === 'decision') return [event];
  const decision = queue[0]?.kind === 'decision' ? queue[0] : undefined;
  return decision ? [decision, event] : [event];
}

export function startFollow(sessionId: string, agentId: string): FollowState {
  return { sessionId, agentId, phase: 'following', lastSeq: 0 };
}

export function receiveFollowActivity(
  state: FollowState,
  event: FollowActivity,
): { state: FollowState; activity?: FollowActivity } {
  if (
    state.phase === 'completed' || event.sessionId !== state.sessionId ||
    event.agentId !== state.agentId || event.seq <= state.lastSeq
  ) {
    return { state };
  }
  if (event.kind === 'finish') {
    return { state: { ...state, phase: 'completed', lastSeq: event.seq, pending: undefined }, activity: event };
  }
  const previous = state.phase === 'paused' ? state.pending : state.focus;
  const activity: FollowActivity = event.kind === 'focus' && previous?.kind === 'decision' &&
    sameFollowLocation(previous, event)
    ? { ...event, kind: 'decision', message: previous.message }
    : event;
  if (state.phase === 'paused') {
    return { state: { ...state, lastSeq: event.seq, pending: activity } };
  }
  return {
    state: { ...state, lastSeq: event.seq, focus: activity },
    activity,
  };
}

export function pauseFollow(state: FollowState): FollowState {
  return state.phase === 'following'
    ? { ...state, phase: 'paused', pending: state.focus }
    : state;
}

export function resumeFollow(state: FollowState): { state: FollowState; activity?: FollowActivity } {
  if (state.phase !== 'paused') return { state };
  return {
    state: { ...state, phase: 'following', pending: undefined, focus: state.pending ?? state.focus },
    activity: state.pending,
  };
}
