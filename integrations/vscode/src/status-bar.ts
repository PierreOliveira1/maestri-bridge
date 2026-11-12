import * as vscode from 'vscode';
import { countAttention } from '@maestri-bridge/core';
import type { AgentMonitor } from './agent-monitor.ts';
import { attentionTooltip } from './agents-tree.ts';
import { t } from './i18n/index.ts';
import type { MaestriSession } from './session.ts';

export function createStatusBar(
  session: MaestriSession,
  monitor?: AgentMonitor,
): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(
    'maestriBridge.status',
    vscode.StatusBarAlignment.Right,
    100,
  );
  item.name = 'Maestri Bridge';

  let paired = false;

  const render = (): void => {
    item.backgroundColor = undefined;

    if (!paired) {
      item.text = '$(debug-disconnect) Maestri';
      item.tooltip = t('agents.statusBar.unpaired');
      item.command = 'maestriBridge.pair';
      return;
    }

    const snapshot = monitor?.snapshot;
    const count = snapshot === undefined ? 0 : countAttention(snapshot);
    if (count > 0) {
      item.text = `$(bell-dot) Maestri · ${count}`;
      item.tooltip = attentionTooltip(count);
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      item.text = '$(broadcast) Maestri';
      item.tooltip = t('agents.statusBar.paired');
    }
    item.command = 'workbench.view.extension.maestri';
  };

  const refreshCredentials = (): void => {
    void session.store.get().then(
      (credentials) => {
        paired = credentials !== undefined;
        render();
      },
      () => {
        paired = false;
        render();
      },
    );
  };

  refreshCredentials();
  const credentialsListener = session.onDidChangeCredentials(() => {
    refreshCredentials();
  });
  const monitorListener = monitor?.onDidChange(() => {
    render();
  });
  item.show();

  return new vscode.Disposable(() => {
    credentialsListener.dispose();
    monitorListener?.dispose();
    item.dispose();
  });
}
