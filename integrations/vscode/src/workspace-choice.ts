import { matchWorkspaceByPath } from '@maestri-bridge/core';
import type { WorkspaceSummary } from '@maestri-bridge/core';

export interface WorkspaceChoiceInput {
  workspaces: readonly WorkspaceSummary[];
  filePath?: string;
  folderPath?: string;
  rememberedWorkspaceId?: string;
  activeWorkspaceId?: string;
}

export function chooseWorkspace(input: WorkspaceChoiceInput): WorkspaceSummary | undefined {
  const { workspaces, filePath, folderPath, rememberedWorkspaceId, activeWorkspaceId } = input;

  if (filePath !== undefined) {
    const byFile = matchWorkspaceByPath(workspaces, filePath);
    if (byFile !== undefined) {
      return byFile;
    }
  }

  if (folderPath !== undefined) {
    const byFolder = matchWorkspaceByPath(workspaces, folderPath);
    if (byFolder !== undefined) {
      return byFolder;
    }
  }

  if (rememberedWorkspaceId !== undefined) {
    const remembered = workspaces.find((workspace) => workspace.id === rememberedWorkspaceId);
    if (remembered !== undefined) {
      return remembered;
    }
  }

  if (activeWorkspaceId !== undefined) {
    const active = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
    if (active !== undefined) {
      return active;
    }
  }

  const loaded = workspaces.find((workspace) => workspace.isLoaded);
  if (loaded !== undefined) {
    return loaded;
  }

  return workspaces[0];
}
