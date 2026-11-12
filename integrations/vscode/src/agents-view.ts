import * as vscode from 'vscode';
import { countAttention, groupTerminalsByFloor } from '@maestri-bridge/core';
import type { FeedSnapshot, FloorSummary, TerminalSummary, WorkspaceSummary } from '@maestri-bridge/core';
import type { AgentMonitor } from './agent-monitor.ts';
import {
  agentContextValue,
  agentDescription,
  agentStatus,
  attentionTooltip,
  detailLines,
  floorGroupSummary,
  orderAgents,
  otherWorkspaces,
  statusIcon,
  terminalFloor,
  workspaceSummary,
} from './agents-tree.ts';
import type { DetailLine } from './agents-tree.ts';
import { collectReferences } from './editor-references.ts';
import { showFlowError } from './flow-errors.ts';
import { t } from './i18n/index.ts';
import { floorLabel } from './send-items.ts';
import type { ComposerSeed, ExtensionServices } from './services.ts';
import type { AgentTarget } from './target-memory.ts';

type AgentsNode =
  | { kind: 'agent'; terminal: TerminalSummary }
  | { kind: 'detail'; terminalId: string; line: DetailLine; index: number }
  | { kind: 'floor'; key: string; label: string; terminals: TerminalSummary[] }
  | { kind: 'others' }
  | { kind: 'workspace'; workspace: WorkspaceSummary }
  | { kind: 'message'; text: string }
  | { kind: 'current'; name: string; detail: string };

interface AgentNode {
  kind: 'agent';
  terminal: TerminalSummary;
}

interface WorkspacePick extends vscode.QuickPickItem {
  workspace: WorkspaceSummary;
}

interface FloorPick extends vscode.QuickPickItem {
  floor: FloorSummary;
}

class AgentsTreeProvider implements vscode.TreeDataProvider<AgentsNode> {
  private readonly emitter = new vscode.EventEmitter<AgentsNode | undefined>();
  readonly onDidChangeTreeData: vscode.Event<AgentsNode | undefined> = this.emitter.event;

  constructor(private readonly monitor: AgentMonitor) {}

  getTreeItem(node: AgentsNode): vscode.TreeItem {
    return this.itemFor(node);
  }

  getChildren(node?: AgentsNode): AgentsNode[] {
    if (node === undefined) {
      return this.rootNodes();
    }
    if (node.kind === 'agent') {
      const snapshot = this.monitor.snapshot;
      if (snapshot === undefined) {
        return [];
      }
      return detailLines(snapshot, node.terminal).map((line, index) => ({
        kind: 'detail',
        terminalId: node.terminal.id,
        line,
        index,
      }));
    }
    if (node.kind === 'floor') {
      const snapshot = this.monitor.snapshot;
      if (snapshot === undefined) {
        return [];
      }
      return orderAgents(snapshot, node.terminals).map(
        (terminal): AgentsNode => ({ kind: 'agent', terminal }),
      );
    }
    if (node.kind === 'others') {
      const currentId = this.monitor.workspaceId ?? this.monitor.snapshot?.workspace.id;
      return otherWorkspaces(this.monitor.workspaces, currentId).map((workspace) => ({
        kind: 'workspace',
        workspace,
      }));
    }
    return [];
  }

  refresh(): void {
    this.emitter.fire(undefined);
  }

  dispose(): void {
    this.emitter.dispose();
  }

  private rootNodes(): AgentsNode[] {
    const snapshot = this.monitor.snapshot;
    if (snapshot === undefined) {
      return [
        {
          kind: 'message',
          text:
            this.monitor.lastError !== undefined
              ? t('agents.view.error')
              : t('agents.view.loading'),
        },
      ];
    }

    const [current, ...otherFloors] = groupTerminalsByFloor(snapshot, this.monitor.floorId);
    const currentTerminals = current?.terminals ?? [];
    const nodes: AgentsNode[] = [
      { kind: 'current', name: snapshot.workspace.name, detail: currentDetail(this.monitor, snapshot) },
      ...orderAgents(snapshot, currentTerminals).map((terminal): AgentsNode => ({ kind: 'agent', terminal })),
    ];
    if (currentTerminals.length === 0) {
      nodes.push({ kind: 'message', text: t('agents.view.emptyFloor') });
    }
    for (const group of otherFloors) {
      nodes.push({
        kind: 'floor',
        key: group.key,
        label: floorLabel(group.floor),
        terminals: group.terminals,
      });
    }

    const currentId = this.monitor.workspaceId ?? snapshot.workspace.id;
    if (otherWorkspaces(this.monitor.workspaces, currentId).length > 0) {
      nodes.push({ kind: 'others' });
    }
    return nodes;
  }

  private itemFor(node: AgentsNode): vscode.TreeItem {
    switch (node.kind) {
      case 'agent':
        return agentItem(this.monitor, node.terminal);
      case 'detail':
        return detailItem(node);
      case 'floor':
        return floorItem(this.monitor, node);
      case 'others': {
        const item = new vscode.TreeItem(
          t('agents.view.otherWorkspaces'),
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.id = 'others';
        return item;
      }
      case 'workspace':
        return workspaceItem(node.workspace);
      case 'message':
        return messageItem(node.text);
      case 'current':
        return currentItem(node.name, node.detail);
    }
  }
}

export function registerAgentsView(
  services: ExtensionServices,
  monitor: AgentMonitor,
): vscode.Disposable {
  const provider = new AgentsTreeProvider(monitor);
  const treeView = vscode.window.createTreeView('maestriBridge.agents', {
    treeDataProvider: provider,
    showCollapseAll: false,
  });
  const disposables: vscode.Disposable[] = [provider, treeView];

  const updateChrome = (): void => {
    const snapshot = monitor.snapshot;
    if (snapshot === undefined) {
      treeView.description = undefined;
      treeView.badge = undefined;
      return;
    }

    const chosenFloor =
      monitor.floorId === undefined
        ? undefined
        : snapshot.floors.find((floor) => (floor.id ?? 'ground') === monitor.floorId);
    const floor = chosenFloor ?? snapshot.floors.find((item) => item.isActive);
    treeView.description =
      floor === undefined
        ? snapshot.workspace.name
        : t('agents.view.description', {
            workspace: snapshot.workspace.name,
            floor: floorLabel(floor),
          });

    const count = countAttention(snapshot);
    treeView.badge =
      count > 0 ? { value: count, tooltip: attentionTooltip(count) } : undefined;
  };

  disposables.push(
    monitor.onDidChange(() => {
      provider.refresh();
      updateChrome();
    }),
  );

  disposables.push(
    treeView.onDidChangeVisibility((event) => {
      monitor.setViewVisible(event.visible);
    }),
  );

  disposables.push(
    vscode.commands.registerCommand('maestriBridge.agents.refresh', () => {
      monitor.refresh();
    }),
    vscode.commands.registerCommand(
      'maestriBridge.agents.showWorkspace',
      (workspaceId: unknown) => {
        if (typeof workspaceId === 'string' && workspaceId !== '') {
          monitor.setWorkspace(workspaceId);
        }
      },
    ),
    vscode.commands.registerCommand('maestriBridge.agents.switchWorkspace', () =>
      switchWorkspace(services, monitor),
    ),
    vscode.commands.registerCommand('maestriBridge.agents.sendTo', (node: unknown) =>
      sendTo(services, monitor, node),
    ),
    vscode.commands.registerCommand('maestriBridge.agents.openInMaestri', (node: unknown) =>
      openInMaestri(services, monitor, node),
    ),
    vscode.commands.registerCommand('maestriBridge.agents.approve', (node: unknown) =>
      respond(services, monitor, node, 'approve'),
    ),
    vscode.commands.registerCommand('maestriBridge.agents.reject', (node: unknown) =>
      respond(services, monitor, node, 'reject'),
    ),
  );

  monitor.setViewVisible(treeView.visible);
  updateChrome();

  return new vscode.Disposable(() => {
    for (const disposable of disposables) {
      disposable.dispose();
    }
  });
}

function agentItem(monitor: AgentMonitor, terminal: TerminalSummary): vscode.TreeItem {
  const item = new vscode.TreeItem(terminal.name);
  item.id = `agent:${terminal.id}`;
  item.collapsibleState = vscode.TreeItemCollapsibleState.None;

  const snapshot = monitor.snapshot;
  if (snapshot === undefined) {
    return item;
  }

  const status = agentStatus(snapshot, terminal);
  const icon = statusIcon(status, terminal.isManager);
  item.description = agentDescription(snapshot, terminal);
  item.iconPath = new vscode.ThemeIcon(
    icon.id,
    icon.color === undefined ? undefined : new vscode.ThemeColor(icon.color),
  );
  item.contextValue = agentContextValue(snapshot, terminal);
  item.collapsibleState =
    detailLines(snapshot, terminal).length === 0
      ? vscode.TreeItemCollapsibleState.None
      : status === 'attention'
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed;
  item.tooltip = agentTooltip(snapshot, terminal);
  return item;
}

function detailItem(node: {
  kind: 'detail';
  terminalId: string;
  line: DetailLine;
  index: number;
}): vscode.TreeItem {
  const item = new vscode.TreeItem('');
  item.id = `detail:${node.terminalId}:${node.index}`;
  item.description = node.line.text;
  item.tooltip = node.line.text;
  item.collapsibleState = vscode.TreeItemCollapsibleState.None;
  if (node.line.kind === 'prompt') {
    item.iconPath = new vscode.ThemeIcon(
      'question',
      new vscode.ThemeColor('charts.orange'),
    );
  }
  return item;
}

function workspaceItem(workspace: WorkspaceSummary): vscode.TreeItem {
  const item = new vscode.TreeItem(workspace.name);
  item.description = workspaceSummary(workspace);
  item.collapsibleState = vscode.TreeItemCollapsibleState.None;
  item.iconPath =
    (workspace.attentionCount ?? 0) > 0
      ? new vscode.ThemeIcon('bell-dot', new vscode.ThemeColor('charts.orange'))
      : new vscode.ThemeIcon('folder');
  item.command = {
    command: 'maestriBridge.agents.showWorkspace',
    arguments: [workspace.id],
    title: t('agents.view.show'),
  };
  return item;
}

function floorItem(
  monitor: AgentMonitor,
  node: { key: string; label: string; terminals: TerminalSummary[] },
): vscode.TreeItem {
  const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
  item.id = `floor:${node.key}`;
  const snapshot = monitor.snapshot;
  const attention =
    snapshot === undefined
      ? false
      : node.terminals.some((terminal) => agentStatus(snapshot, terminal) === 'attention');
  if (snapshot !== undefined) {
    item.description = floorGroupSummary(snapshot, node.terminals);
  }
  item.iconPath = attention
    ? new vscode.ThemeIcon('bell-dot', new vscode.ThemeColor('charts.orange'))
    : new vscode.ThemeIcon('layers');
  return item;
}

function messageItem(text: string): vscode.TreeItem {
  const item = new vscode.TreeItem(text);
  item.collapsibleState = vscode.TreeItemCollapsibleState.None;
  item.iconPath = new vscode.ThemeIcon('info');
  return item;
}

function agentTooltip(snapshot: FeedSnapshot, terminal: TerminalSummary): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();
  tooltip.appendMarkdown(`**${terminal.name}**`);
  tooltip.appendMarkdown('\n\n');
  tooltip.appendText(agentDescription(snapshot, terminal));
  if (terminal.preview.length > 0) {
    tooltip.appendMarkdown('\n\n');
    tooltip.appendCodeblock(terminal.preview.slice(-8).join('\n'), 'text');
  }
  return tooltip;
}

async function switchWorkspace(
  services: ExtensionServices,
  monitor: AgentMonitor,
): Promise<void> {
  if (monitor.workspaces.length === 0) {
    return;
  }

  try {
    const items: WorkspacePick[] = monitor.workspaces.map((workspace) => ({
      label: `$(folder) ${workspace.name}`,
      description: workspaceSummary(workspace),
      detail: workspace.workingDirectory,
      workspace,
    }));
    const chosen = await vscode.window.showQuickPick(items, {
      title: t('agents.workspacePicker.title'),
      placeHolder: t('agents.workspacePicker.title'),
    });
    if (chosen === undefined) {
      return;
    }

    const client = monitor.client;
    if (client === undefined) {
      return;
    }

    const feed = await client.getFeed(chosen.workspace.id);
    if (feed.floors.length > 1) {
      const floorItems: FloorPick[] = feed.floors.map((floor) => ({
        label: floorLabel(floor),
        description: floor.isActive ? t('agents.floor.active') : undefined,
        floor,
      }));
      const pickedFloor = await vscode.window.showQuickPick(floorItems, {
        title: t('agents.floorPicker.title'),
        placeHolder: t('agents.floorPicker.title'),
      });
      if (pickedFloor === undefined) {
        return;
      }
      monitor.setWorkspace(chosen.workspace.id, pickedFloor.floor.id ?? 'ground');
      return;
    }
    monitor.setWorkspace(chosen.workspace.id);
  } catch (error) {
    await showFlowError(services.session, error);
  }
}

async function sendTo(
  services: ExtensionServices,
  monitor: AgentMonitor,
  node: unknown,
): Promise<void> {
  if (!isAgentNode(node)) {
    return;
  }

  const editor = vscode.window.activeTextEditor;
  const hasSelection =
    editor !== undefined && editor.selections.some((selection) => !selection.isEmpty);
  const references = editor !== undefined && hasSelection ? collectReferences(editor) : [];

  const seed: ComposerSeed = { references };
  const target = agentTarget(monitor, node.terminal);
  if (target !== undefined) {
    seed.target = target;
  }

  try {
    await vscode.commands.executeCommand('maestriBridge.openComposer', seed);
  } catch (error) {
    await showFlowError(services.session, error);
  }
}

async function openInMaestri(
  services: ExtensionServices,
  monitor: AgentMonitor,
  node: unknown,
): Promise<void> {
  if (!isAgentNode(node)) {
    return;
  }
  const client = monitor.client;
  if (client === undefined) {
    return;
  }
  try {
    await client.focusTerminal(node.terminal.id);
  } catch (error) {
    await showFlowError(services.session, error);
  }
}

async function respond(
  services: ExtensionServices,
  monitor: AgentMonitor,
  node: unknown,
  action: 'approve' | 'reject',
): Promise<void> {
  if (!isAgentNode(node)) {
    return;
  }
  const client = monitor.client;
  if (client === undefined) {
    return;
  }
  try {
    if (action === 'approve') {
      await client.approve(node.terminal.id);
    } else {
      await client.reject(node.terminal.id);
    }
    monitor.refresh();
  } catch (error) {
    await showFlowError(services.session, error);
  }
}

function agentTarget(
  monitor: AgentMonitor,
  terminal: TerminalSummary,
): AgentTarget | undefined {
  const workspaceId = monitor.workspaceId;
  const snapshot = monitor.snapshot;
  if (workspaceId === undefined || snapshot === undefined) {
    return undefined;
  }
  const target: AgentTarget = {
    workspaceId,
    workspaceName: snapshot.workspace.name,
    terminalId: terminal.id,
    terminalName: terminal.name,
  };
  const floor = terminalFloor(snapshot, terminal);
  if (floor !== undefined) {
    target.floorId = floor.floorId;
    target.floorName = floor.floorName;
  }
  return target;
}

function isAgentNode(value: unknown): value is AgentNode {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.kind !== 'agent') {
    return false;
  }
  const terminal = record.terminal;
  if (typeof terminal !== 'object' || terminal === null) {
    return false;
  }
  const terminalRecord = terminal as Record<string, unknown>;
  return (
    typeof terminalRecord.id === 'string' && typeof terminalRecord.name === 'string'
  );
}

function currentDetail(monitor: AgentMonitor, snapshot: FeedSnapshot): string {
  const chosenFloor =
    monitor.floorId === undefined
      ? undefined
      : snapshot.floors.find((floor) => (floor.id ?? 'ground') === monitor.floorId);
  const floor = chosenFloor ?? snapshot.floors.find((item) => item.isActive);
  const status =
    monitor.lastError === undefined
      ? t('agents.view.current.live')
      : t('agents.view.current.reconnecting');
  return floor === undefined
    ? status
    : t('agents.view.current.floorDetail', { floor: floorLabel(floor), status });
}

function currentItem(name: string, detail: string): vscode.TreeItem {
  const item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.None);
  item.id = 'current';
  item.description = detail;
  item.iconPath = new vscode.ThemeIcon('folder-opened');
  item.tooltip = t('agents.view.current.tooltip');
  item.command = {
    command: 'maestriBridge.agents.switchWorkspace',
    title: t('agents.view.current.switchTitle'),
  };
  return item;
}
