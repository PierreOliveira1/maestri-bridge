import * as vscode from 'vscode';
import { AgentMonitor } from './agent-monitor.ts';
import { AgentFollow } from './agent-follow.ts';
import { registerAgentNotes } from './agent-notes.ts';
import { registerAgentsView } from './agents-view.ts';
import { registerAttentionNotifier } from './attention-notifier.ts';
import { registerChatView } from './chat-view.ts';
import { registerCommentComposer } from './comment-composer.ts';
import { CredentialStore } from './credential-store.ts';
import { runPairingFlow } from './pairing-flow.ts';
import { runQuickSend } from './quick-send.ts';
import type { ExtensionServices } from './services.ts';
import { MaestriSession } from './session.ts';
import { t } from './i18n/index.ts';
import { registerLocale } from './locale-setting.ts';
import { createStatusBar } from './status-bar.ts';
import { TargetMemory } from './target-memory.ts';

export function activate(context: vscode.ExtensionContext): void {
  let onLocaleChange = (): void => {};
  context.subscriptions.push(registerLocale(() => onLocaleChange()));

  const store = new CredentialStore(context.secrets);
  const session = new MaestriSession(store);
  const memory = new TargetMemory(context.workspaceState);
  const services: ExtensionServices = { context, session, memory };
  const monitor = new AgentMonitor(services);
  const follow = new AgentFollow(services, monitor);
  onLocaleChange = () => monitor.refresh();

  context.subscriptions.push(
    store,
    session,
    monitor,
    follow,
    vscode.commands.registerCommand('maestriBridge.pair', () => runPairingFlow(store)),
    vscode.commands.registerCommand('maestriBridge.unpair', async () => {
      await store.clear();
      void vscode.window.showInformationMessage(t('pairing.unpaired'));
    }),
    vscode.commands.registerCommand('maestriBridge.quickSend', () =>
      runQuickSend(session, memory),
    ),
    registerCommentComposer(services),
    registerChatView(services, monitor, follow),
    registerAgentNotes(services, monitor, (uri) => follow.handleUri(uri)),
    registerAgentsView(services, monitor, follow),
    registerAttentionNotifier(services, monitor),
    createStatusBar(session, monitor),
  );

  void monitor.start();
}

export function deactivate(): void {}
