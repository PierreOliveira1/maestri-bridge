import type { FeedSnapshot, TerminalSummary, WorkspaceSummary } from './models.ts';

export interface TerminalDirectory {
  listWorkspaces(): Promise<WorkspaceSummary[]>;
  getFeed(workspaceId: string): Promise<FeedSnapshot>;
}

export interface LocatedTerminal {
  workspace: WorkspaceSummary;
  terminal: TerminalSummary;
}

export interface LocateOptions {
  snapshots?: readonly FeedSnapshot[];
  preferredWorkspaceId?: string;
}

export async function locateTerminal(
  directory: TerminalDirectory,
  terminalId: string,
  options?: LocateOptions,
): Promise<LocatedTerminal | undefined> {
  const snapshots = options?.snapshots ?? [];

  for (const snapshot of snapshots) {
    const terminal = snapshot.terminals.find((item) => item.id === terminalId);
    if (terminal !== undefined) {
      return { workspace: snapshot.workspace, terminal };
    }
  }

  const covered = new Set(snapshots.map((snapshot) => snapshot.workspace.id));
  const workspaces = await directory.listWorkspaces();
  const loaded = workspaces.filter((workspace) => workspace.isLoaded);
  const preferredId = options?.preferredWorkspaceId;
  const ordered: WorkspaceSummary[] = [];

  if (preferredId !== undefined) {
    const preferred = loaded.find((workspace) => workspace.id === preferredId);
    if (preferred !== undefined) {
      ordered.push(preferred);
    }
  }
  for (const workspace of loaded) {
    if (workspace.id !== preferredId) {
      ordered.push(workspace);
    }
  }

  for (const workspace of ordered) {
    if (covered.has(workspace.id)) {
      continue;
    }
    let snapshot: FeedSnapshot;
    try {
      snapshot = await directory.getFeed(workspace.id);
    } catch {
      continue;
    }
    const terminal = snapshot.terminals.find((item) => item.id === terminalId);
    if (terminal !== undefined) {
      return { workspace: snapshot.workspace, terminal };
    }
  }

  return undefined;
}
