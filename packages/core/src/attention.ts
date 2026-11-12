import type { FeedSnapshot, TerminalSummary } from './models.ts';

export interface AttentionInfo {
  reason: string;
  pendingPrompt?: string;
}

export interface AttentionEvent extends AttentionInfo {
  terminal: TerminalSummary;
}

export function pendingPromptFor(snapshot: FeedSnapshot, terminalId: string): string | undefined {
  return snapshot.pendingPrompts.find((pending) => pending.terminalId === terminalId)?.prompt;
}

export function needsAttention(snapshot: FeedSnapshot, terminal: TerminalSummary): boolean {
  return terminal.needsAttention || pendingPromptFor(snapshot, terminal.id) !== undefined;
}

export function attentionInfo(snapshot: FeedSnapshot, terminal: TerminalSummary): AttentionInfo {
  const pendingPrompt = pendingPromptFor(snapshot, terminal.id);
  if (pendingPrompt !== undefined) {
    return { reason: pendingPrompt, pendingPrompt };
  }

  if (terminal.maestroRequest !== undefined) {
    return { reason: terminal.maestroRequest.message };
  }

  for (const line of [...terminal.preview].reverse()) {
    const collapsed = line.trim().replace(/\s+/g, ' ');
    if (collapsed !== '') {
      return { reason: collapsed };
    }
  }

  return { reason: 'Terminou e está aguardando você.' };
}

export function detectNewAttention(
  previous: FeedSnapshot | undefined,
  next: FeedSnapshot,
): AttentionEvent[] {
  if (previous === undefined || previous.workspace.id !== next.workspace.id) {
    return [];
  }

  const previousById = new Map<string, TerminalSummary>();
  for (const terminal of previous.terminals) {
    previousById.set(terminal.id, terminal);
  }

  const events: AttentionEvent[] = [];
  for (const terminal of next.terminals) {
    if (!needsAttention(next, terminal)) {
      continue;
    }

    const before = previousById.get(terminal.id);
    if (before === undefined) {
      events.push({ ...attentionInfo(next, terminal), terminal });
      continue;
    }

    const wasAttention = needsAttention(previous, before);
    const previousPrompt = pendingPromptFor(previous, terminal.id);
    const nextPrompt = pendingPromptFor(next, terminal.id);
    const promptChanged = previousPrompt !== undefined && previousPrompt !== nextPrompt;
    const previousMessage = before.maestroRequest?.message;
    const nextMessage = terminal.maestroRequest?.message;
    const requestChanged = previousMessage !== undefined && previousMessage !== nextMessage;

    if (!wasAttention || promptChanged || requestChanged) {
      events.push({ ...attentionInfo(next, terminal), terminal });
    }
  }

  return events;
}

export function countAttention(snapshot: FeedSnapshot): number {
  return snapshot.terminals.filter((terminal) => needsAttention(snapshot, terminal)).length;
}
