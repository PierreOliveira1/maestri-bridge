import * as vscode from 'vscode';
import { groupTerminalsByFloor, rankTerminals } from '@maestri-bridge/core';
import type {
  CodeReference,
  FeedSnapshot,
  FloorSummary,
  HostInfo,
  TerminalSummary,
  WorkspaceSummary,
  WireClient,
} from '@maestri-bridge/core';
import type { MaestriSession } from './session.ts';
import type { AgentTarget, TargetMemory } from './target-memory.ts';
import { showFlowError } from './flow-errors.ts';
import { t } from './i18n/index.ts';
import { floorLabel, summarizeReferences, terminalItemView, workspaceDetail } from './send-items.ts';
import { chooseWorkspace } from './workspace-choice.ts';

type PickAction =
  | { kind: 'terminal'; terminal: TerminalSummary; floor?: { id: string; name: string } }
  | { kind: 'switchWorkspace' };

interface PickItem extends vscode.QuickPickItem {
  action?: PickAction;
}

interface WorkspacePickItem extends vscode.QuickPickItem {
  workspace: WorkspaceSummary;
}

export interface PickedAgent {
  workspace: WorkspaceSummary;
  floorId?: string;
  floorName?: string;
  terminal: TerminalSummary;
}

export function toAgentTarget(picked: PickedAgent): AgentTarget {
  const target: AgentTarget = {
    workspaceId: picked.workspace.id,
    workspaceName: picked.workspace.name,
    terminalId: picked.terminal.id,
    terminalName: picked.terminal.name,
  };
  if (picked.floorId !== undefined) {
    target.floorId = picked.floorId;
  }
  if (picked.floorName !== undefined) {
    target.floorName = picked.floorName;
  }
  return target;
}

export async function pickAgent(options: {
  session: MaestriSession;
  client: WireClient;
  memory: TargetMemory;
  references: readonly CodeReference[];
  filePath?: string;
  title?: string;
}): Promise<PickedAgent | undefined> {
  const { session, client, memory, references } = options;
  const baseTitle = options.title ?? t('agents.picker.title');

  const quickPick = vscode.window.createQuickPick<PickItem>();
  quickPick.title = baseTitle;
  quickPick.placeholder = t('agents.picker.loading');
  quickPick.busy = true;
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;
  quickPick.ignoreFocusOut = false;
  quickPick.show();

  let workspace: WorkspaceSummary | undefined;
  let workspaces: readonly WorkspaceSummary[] = [];
  let disposed = false;
  let accepted = false;
  let hidingForNavigation = false;
  let settled = false;
  let resolveResult: (value: PickedAgent | undefined) => void = () => {};

  const result = new Promise<PickedAgent | undefined>((resolve) => {
    resolveResult = resolve;
  });

  const disposeQuickPick = (): void => {
    if (!disposed) {
      disposed = true;
      quickPick.dispose();
    }
  };

  const finish = (picked: PickedAgent | undefined): void => {
    if (settled) {
      return;
    }
    settled = true;
    disposeQuickPick();
    resolveResult(picked);
  };

  const fail = async (error: unknown): Promise<void> => {
    finish(undefined);
    await showFlowError(session, error);
  };

  const render = (target: WorkspaceSummary, snapshot: FeedSnapshot): void => {
    quickPick.title = t('agents.picker.titleWithWorkspace', {
      title: baseTitle,
      workspace: target.name,
    });
    quickPick.placeholder =
      references.length > 0
        ? t('agents.picker.placeholderWithReferences', {
            summary: summarizeReferences(references),
          })
        : t('agents.picker.placeholder');

    const groups = groupTerminalsByFloor(snapshot);
    const showFloors = snapshot.floors.length > 1;
    const lastTerminalId = memory.lastTerminalId(target.id);
    const items: PickItem[] = [];
    let firstTerminal: PickItem | undefined;

    for (const group of groups) {
      if (showFloors) {
        items.push({
          kind: vscode.QuickPickItemKind.Separator,
          label: floorSeparator(group.floor, group.isCurrent),
        });
      }
      if (group.terminals.length === 0) {
        items.push({ label: `$(info) ${t('agents.view.emptyFloor')}` });
        continue;
      }
      for (const terminal of rankTerminals(group.terminals, lastTerminalId)) {
        const view = terminalItemView(terminal);
        const item: PickItem = {
          label: view.label,
          description: showFloors
            ? t('agents.picker.itemDescriptionWithFloor', {
                description: view.description,
                floor: floorLabel(group.floor),
              })
            : view.description,
          action: {
            kind: 'terminal',
            terminal,
            ...(showFloors ? { floor: { id: group.key, name: floorLabel(group.floor) } } : {}),
          },
        };
        if (view.detail !== undefined) {
          item.detail = view.detail;
        }
        items.push(item);
        firstTerminal ??= item;
      }
    }

    if (groups.length === 0) {
      items.push({ label: `$(info) ${t('agents.picker.emptyWorkspace')}` });
    }
    items.push({
      kind: vscode.QuickPickItemKind.Separator,
      label: t('agents.picker.otherOptions'),
    });
    items.push({
      label: `$(arrow-swap) ${t('agents.picker.switchWorkspace')}`,
      description: target.name,
      action: { kind: 'switchWorkspace' },
    });

    quickPick.items = items;
    quickPick.activeItems = firstTerminal === undefined ? [] : [firstTerminal];
    quickPick.busy = false;
  };

  const loadFeed = async (target: WorkspaceSummary): Promise<boolean> => {
    quickPick.busy = true;
    try {
      const snapshot = await client.getFeed(target.id);
      if (disposed) {
        return false;
      }
      workspace = target;
      render(target, snapshot);
      return true;
    } catch (error) {
      await fail(error);
      return false;
    }
  };

  const switchWorkspace = async (): Promise<void> => {
    hidingForNavigation = true;
    quickPick.hide();

    const items: WorkspacePickItem[] = workspaces.map((item) => ({
      label: `$(folder) ${item.name}`,
      description: item.workingDirectory,
      detail: workspaceDetail(item),
      workspace: item,
    }));

    const chosen = await vscode.window.showQuickPick(items, {
      title: t('agents.workspacePicker.title'),
      placeHolder: t('agents.workspacePicker.title'),
    });

    if (chosen === undefined) {
      if (!disposed) {
        quickPick.show();
      }
      return;
    }

    const loaded = await loadFeed(chosen.workspace);
    if (loaded && !disposed) {
      quickPick.show();
    }
  };

  const handleAction = async (action: PickAction): Promise<void> => {
    if (action.kind === 'terminal') {
      const target = workspace;
      if (target === undefined) {
        finish(undefined);
        return;
      }
      accepted = true;
      const picked: PickedAgent = { workspace: target, terminal: action.terminal };
      if (action.floor !== undefined) {
        picked.floorId = action.floor.id;
        picked.floorName = action.floor.name;
      }
      finish(picked);
      return;
    }
    await switchWorkspace();
  };

  quickPick.onDidAccept(() => {
    const item = quickPick.selectedItems[0];
    if (item === undefined || item.action === undefined) {
      return;
    }
    void handleAction(item.action);
  });

  quickPick.onDidHide(() => {
    if (hidingForNavigation) {
      hidingForNavigation = false;
      return;
    }
    if (!accepted) {
      finish(undefined);
    }
  });

  const initialize = async (): Promise<void> => {
    let info: HostInfo;
    try {
      [info, workspaces] = await Promise.all([client.info(), client.listWorkspaces()]);
    } catch (error) {
      await fail(error);
      return;
    }

    if (disposed) {
      return;
    }

    const chosenWorkspace = chooseWorkspace({
      workspaces,
      filePath: options.filePath,
      folderPath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      rememberedWorkspaceId: memory.lastWorkspaceId(),
      activeWorkspaceId: info.activeWorkspaceId,
    });

    if (chosenWorkspace === undefined) {
      finish(undefined);
      void vscode.window.showWarningMessage(t('agents.picker.noWorkspace'));
      return;
    }

    await loadFeed(chosenWorkspace);
  };

  await initialize();
  return result;
}

function floorSeparator(floor: FloorSummary, isCurrent: boolean): string {
  const label = floorLabel(floor);
  return isCurrent ? t('agents.picker.floorCurrent', { floor: label }) : label;
}
