import { resolve, sep } from 'node:path';
import type { TerminalSummary, WorkspaceSummary } from './models.ts';

export function matchWorkspaceByPath(
  workspaces: readonly WorkspaceSummary[],
  filePath: string,
): WorkspaceSummary | undefined {
  const resolvedFilePath = resolve(filePath);
  let best: WorkspaceSummary | undefined;
  let bestLength = -1;

  for (const workspace of workspaces) {
    if (workspace.workingDirectory === undefined) {
      continue;
    }
    const directory = resolve(workspace.workingDirectory);
    const prefix = directory.endsWith(sep) ? directory : `${directory}${sep}`;
    if (resolvedFilePath !== directory && !resolvedFilePath.startsWith(prefix)) {
      continue;
    }
    if (directory.length > bestLength) {
      best = workspace;
      bestLength = directory.length;
    }
  }

  return best;
}

export function rankTerminals(
  terminals: readonly TerminalSummary[],
  preferredId?: string,
): TerminalSummary[] {
  return [...terminals].sort((a, b) => {
    const preferred = Number(b.id === preferredId) - Number(a.id === preferredId);
    if (preferred !== 0) {
      return preferred;
    }

    const running = Number(b.isRunning) - Number(a.isRunning);
    if (running !== 0) {
      return running;
    }

    const attention = Number(b.needsAttention) - Number(a.needsAttention);
    if (attention !== 0) {
      return attention;
    }

    const aTime = lastActiveTime(a.lastActiveAt);
    const bTime = lastActiveTime(b.lastActiveAt);
    if (aTime !== bTime) {
      return bTime - aTime;
    }

    return a.name.localeCompare(b.name, 'pt-BR');
  });
}

function lastActiveTime(value: string | undefined): number {
  if (value === undefined) {
    return Number.NEGATIVE_INFINITY;
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}
