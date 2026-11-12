import * as vscode from 'vscode';
import type { AttentionEvent, TerminalSummary } from '@maestri-bridge/core';
import type { AgentMonitor } from './agent-monitor.ts';
import { terminalFloor } from './agents-tree.ts';
import { showFlowError } from './flow-errors.ts';
import { t } from './i18n/index.ts';
import type { ComposerSeed, ExtensionServices } from './services.ts';
import type { AgentTarget } from './target-memory.ts';

export function registerAttentionNotifier(
  services: ExtensionServices,
  monitor: AgentMonitor,
): vscode.Disposable {
  return monitor.onDidDetectAttention((events) => {
    void notifyEvents(services, monitor, events).catch(() => undefined);
  });
}

async function notifyEvents(
  services: ExtensionServices,
  monitor: AgentMonitor,
  events: readonly AttentionEvent[],
): Promise<void> {
  if (events.length === 0 || !notificationsEnabled()) {
    return;
  }

  if (events.length > 3) {
    const message = t(
      events.length === 1
        ? 'agents.notification.aggregate.one'
        : 'agents.notification.aggregate.other',
      { count: events.length },
    );
    const showAgents = t('agents.notification.showAgents');
    void vscode.window
      .showWarningMessage(message, showAgents)
      .then(
        (choice) => {
          if (choice === showAgents) {
            void vscode.commands
              .executeCommand('workbench.view.extension.maestri')
              .then(undefined, () => undefined);
          }
        },
        () => undefined,
      );
    return;
  }

  for (const event of events) {
    showEvent(services, monitor, event);
  }
}

function showEvent(
  services: ExtensionServices,
  monitor: AgentMonitor,
  event: AttentionEvent,
): void {
  const name = event.terminal.name;
  const reason = clipReason(event.reason);
  const text = t('agents.notification.message', { name, reason });
  const approve = t('agents.action.approve');
  const reject = t('agents.action.reject');
  const openInMaestri = t('agents.action.openInMaestri');
  const writeTo = t('agents.action.writeTo');
  const buttons =
    event.pendingPrompt !== undefined
      ? [approve, reject, openInMaestri]
      : [openInMaestri, writeTo];

  void vscode.window.showWarningMessage(text, ...buttons).then(
    (choice) => {
      if (choice !== undefined) {
        void handleChoice(services, monitor, event, choice).catch(() => undefined);
      }
    },
    () => undefined,
  );
}

async function handleChoice(
  services: ExtensionServices,
  monitor: AgentMonitor,
  event: AttentionEvent,
  choice: string,
): Promise<void> {
  try {
    const writeTo = t('agents.action.writeTo');
    const approve = t('agents.action.approve');
    const reject = t('agents.action.reject');
    const openInMaestri = t('agents.action.openInMaestri');

    if (choice === writeTo) {
      const seed = composerSeed(monitor, event.terminal);
      if (seed !== undefined) {
        await vscode.commands.executeCommand('maestriBridge.openComposer', seed);
      }
      return;
    }

    const client = monitor.client;
    if (client === undefined) {
      return;
    }

    if (choice === approve) {
      await client.approve(event.terminal.id);
      monitor.refresh();
      return;
    }
    if (choice === reject) {
      await client.reject(event.terminal.id);
      monitor.refresh();
      return;
    }
    if (choice === openInMaestri) {
      await client.focusTerminal(event.terminal.id);
    }
  } catch (error) {
    await showFlowError(services.session, error);
  }
}

function composerSeed(
  monitor: AgentMonitor,
  terminal: TerminalSummary,
): ComposerSeed | undefined {
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
  return { target };
}

function clipReason(reason: string): string {
  return reason.length > 140 ? `${reason.slice(0, 140)}…` : reason;
}

function notificationsEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('maestriBridge')
    .get<boolean>('notifyAttention', true);
}
