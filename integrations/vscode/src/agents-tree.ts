import { floorKey, meaningfulPreview, needsAttention, pendingPromptFor, rankTerminals } from '@maestri-bridge/core';
import type { FeedSnapshot, TerminalSummary, WorkspaceSummary } from '@maestri-bridge/core';
import { t } from './i18n/index.ts';
import { agentLabel, floorLabel } from './send-items.ts';

export type AgentStatus = 'attention' | 'working' | 'idle' | 'stopped';

export function agentStatus(snapshot: FeedSnapshot, terminal: TerminalSummary): AgentStatus {
  if (needsAttention(snapshot, terminal)) {
    return 'attention';
  }
  if (!terminal.isRunning) {
    return 'stopped';
  }
  if (terminal.isActive) {
    return 'working';
  }
  return 'idle';
}

export function statusLabel(status: AgentStatus): string {
  switch (status) {
    case 'attention':
      return t('agents.status.attention');
    case 'working':
      return t('agents.status.working');
    case 'idle':
      return t('agents.status.idle');
    case 'stopped':
      return t('agents.status.stopped');
  }
}

export function statusIcon(
  status: AgentStatus,
  isManager: boolean,
): { id: string; color?: string } {
  switch (status) {
    case 'attention':
      return { id: 'bell-dot', color: 'charts.orange' };
    case 'working':
      return { id: 'sync~spin', color: 'charts.blue' };
    case 'stopped':
      return { id: 'circle-outline', color: 'disabledForeground' };
    case 'idle':
      return isManager
        ? { id: 'star-full', color: 'charts.green' }
        : { id: 'circle-filled', color: 'charts.green' };
  }
}

export function orderAgents(
  snapshot: FeedSnapshot,
  terminals: readonly TerminalSummary[] = snapshot.terminals,
): TerminalSummary[] {
  const ranked = rankTerminals(terminals);
  const attention = ranked.filter((terminal) => agentStatus(snapshot, terminal) === 'attention');
  const rest = ranked.filter((terminal) => agentStatus(snapshot, terminal) !== 'attention');
  return [...attention, ...rest];
}

export function agentDescription(snapshot: FeedSnapshot, terminal: TerminalSummary): string {
  const parts: string[] = [];
  if (terminal.roleName !== undefined && terminal.roleName !== '') {
    parts.push(terminal.roleName);
  }
  const agent = agentLabel(terminal.agentType);
  if (agent !== '') {
    parts.push(agent);
  }
  parts.push(statusLabel(agentStatus(snapshot, terminal)));
  return parts.join(' · ');
}

export function agentContextValue(snapshot: FeedSnapshot, terminal: TerminalSummary): string {
  if (pendingPromptFor(snapshot, terminal.id) !== undefined) {
    return 'agent.attention.pending';
  }
  if (needsAttention(snapshot, terminal)) {
    return 'agent.attention';
  }
  return 'agent';
}

export interface DetailLine {
  kind: 'prompt' | 'preview';
  text: string;
}

export function detailLines(
  snapshot: FeedSnapshot,
  terminal: TerminalSummary,
  max = 3,
): DetailLine[] {
  const lines: DetailLine[] = [];
  const pendingPrompt = pendingPromptFor(snapshot, terminal.id);
  if (pendingPrompt !== undefined) {
    lines.push({ kind: 'prompt', text: pendingPrompt });
  } else if (terminal.maestroRequest !== undefined) {
    lines.push({ kind: 'prompt', text: terminal.maestroRequest.message });
  }

  const preview: DetailLine[] = meaningfulPreview(terminal.preview).map((text) => ({
    kind: 'preview',
    text: clip(text),
  }));

  const limit = Math.max(0, Math.floor(max));
  if (limit > 0) {
    lines.push(...preview.slice(-limit));
  }
  return lines;
}

export function otherWorkspaces(
  workspaces: readonly WorkspaceSummary[],
  currentId: string | undefined,
): WorkspaceSummary[] {
  return [...workspaces]
    .filter((workspace) => workspace.id !== currentId)
    .sort(
      (a, b) =>
        (b.attentionCount ?? 0) - (a.attentionCount ?? 0) ||
        (b.runningTerminalCount ?? 0) - (a.runningTerminalCount ?? 0),
    );
}

export function workspaceSummary(workspace: WorkspaceSummary): string {
  const running = workspace.runningTerminalCount ?? 0;
  const attention = workspace.attentionCount ?? 0;

  if (!workspace.isLoaded && running === 0) {
    return attention > 0
      ? t('agents.workspace.summary.dormantAttention', { attention })
      : t('agents.workspace.summary.dormant');
  }

  if (attention > 0) {
    return t(
      running === 1
        ? 'agents.workspace.summary.runningAttention.one'
        : 'agents.workspace.summary.runningAttention.other',
      { count: running, attention },
    );
  }

  return t(
    running === 1
      ? 'agents.workspace.summary.running.one'
      : 'agents.workspace.summary.running.other',
    { count: running },
  );
}

export function attentionTooltip(count: number): string {
  return t(
    count === 1 ? 'agents.attention.tooltip.one' : 'agents.attention.tooltip.other',
    { count },
  );
}

function clip(text: string): string {
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

export interface TerminalFloor {
  floorId: string;
  floorName: string;
}

export function terminalFloor(
  snapshot: FeedSnapshot,
  terminal: TerminalSummary,
): TerminalFloor | undefined {
  if (snapshot.floors.length <= 1) {
    return undefined;
  }
  const key = floorKey(terminal.floorId);
  const floor = snapshot.floors.find((item) => floorKey(item.id) === key);
  if (floor === undefined) {
    return undefined;
  }
  return { floorId: key, floorName: floorLabel(floor) };
}

export function floorGroupSummary(
  snapshot: FeedSnapshot,
  terminals: readonly TerminalSummary[],
): string {
  const count = terminals.length;
  const attention = terminals.filter((terminal) => needsAttention(snapshot, terminal)).length;
  if (attention > 0) {
    return t(
      count === 1
        ? 'agents.floor.groupAttention.one'
        : 'agents.floor.groupAttention.other',
      { count, attention },
    );
  }
  return t(count === 1 ? 'agents.floor.group.one' : 'agents.floor.group.other', { count });
}
