import * as vscode from 'vscode';
import type { AgentMonitor } from './agent-monitor.ts';
import type { AgentFollow } from './agent-follow.ts';
import { followAccent, followPresentation } from './follow-presentation.ts';
import { parseChatFromWebview } from './chat-protocol.ts';
import type { ChatToWebview } from './chat-protocol.ts';
import { ChatController } from './chat-controller.ts';
import { composerHtml, createNonce } from './composer-html.ts';
import { t } from './i18n/index.ts';
import type { ComposerSeed, ExtensionServices } from './services.ts';

export function registerChatView(
  services: ExtensionServices,
  monitor: AgentMonitor,
  follow: AgentFollow,
): vscode.Disposable {
  const controller = new ChatController(services, monitor);
  let panel: vscode.WebviewPanel | undefined;

  const sendFollowing = (webview: vscode.Webview): void => {
    const summary = follow.summary;
    const note = summary?.note;
    const message: ChatToWebview = {
      type: 'followState',
      startLabel: t(summary && summary.phase !== 'completed' ? 'follow.changeAgent' : 'follow.title'),
      follow: summary ? {
        label: followPresentation(summary).label,
        phase: summary.phase,
        accent: followAccent(summary.agentId).name,
        toggleLabel: t(summary.phase === 'paused' ? 'follow.resume' : 'follow.pause'),
        stopLabel: t('follow.stop'),
        tooltip: t('follow.cooperative'),
        context: [summary.workspaceName, summary.rootPath].filter(Boolean).join(' · '),
        file: summary.file,
        waitingLabel: summary.phase === 'completed' ? '' : t('follow.waitingNote'),
        note: note ? {
          label: t('follow.latestNote'),
          location: `${note.file}:${note.startLine}–${note.endLine}`,
          message: note.message,
        } : undefined,
      } : undefined,
    };
    void webview.postMessage(message);
  };

  const receive = (webview: vscode.Webview, raw: unknown): void => {
    const parsed = parseChatFromWebview(raw);
    if (parsed?.type === 'followAction') {
      void vscode.commands.executeCommand(`maestriBridge.follow.${parsed.action}`);
      return;
    }
    if (parsed?.type === 'ready') sendFollowing(webview);
    void controller.handle(raw);
  };

  const resources = (): vscode.Uri[] => [
    vscode.Uri.joinPath(services.context.extensionUri, 'media'),
    vscode.Uri.joinPath(services.context.extensionUri, 'dist'),
  ];

  const htmlFor = (webview: vscode.Webview): string =>
    composerHtml({
      cspSource: webview.cspSource,
      nonce: createNonce(),
      scriptUri: webview
        .asWebviewUri(vscode.Uri.joinPath(services.context.extensionUri, 'dist', 'chat.js'))
        .toString(),
      styleUri: webview
        .asWebviewUri(vscode.Uri.joinPath(services.context.extensionUri, 'media', 'chat.css'))
        .toString(),
    });

  const provider: vscode.WebviewViewProvider = {
    resolveWebviewView: (view) => {
      view.webview.options = { enableScripts: true, localResourceRoots: resources() };
      view.webview.html = htmlFor(view.webview);
      const updateFollowing = (): void => {
        view.description = follow.summary ? followPresentation(follow.summary).label : undefined;
        sendFollowing(view.webview);
      };
      updateFollowing();
      const followListener = follow.onDidChange(updateFollowing);
      const surface = controller.addSurface(view.webview, view.visible);
      const messageListener = view.webview.onDidReceiveMessage((raw: unknown) => {
        receive(view.webview, raw);
      });
      const visibilityListener = view.onDidChangeVisibility(() => {
        controller.setVisible(surface, view.visible);
      });
      view.onDidDispose(() => {
        followListener.dispose();
        messageListener.dispose();
        visibilityListener.dispose();
        controller.removeSurface(surface);
      });
    },
  };

  const viewRegistration = vscode.window.registerWebviewViewProvider(
    'maestriBridge.chat',
    provider,
    { webviewOptions: { retainContextWhenHidden: true } },
  );

  const attachPanel = (created: vscode.WebviewPanel): void => {
    panel = created;
    created.webview.options = { enableScripts: true, localResourceRoots: resources() };
    created.iconPath = vscode.Uri.joinPath(
      services.context.extensionUri,
      'media',
      'maestri-logo.svg',
    );
    created.webview.html = htmlFor(created.webview);

    const surface = controller.addSurface(created.webview, created.visible);
    const followListener = follow.onDidChange(() => {
      created.title = `${t('chat.panel.title')}${follow.summary ? ` · ${followPresentation(follow.summary).label}` : ''}`;
      sendFollowing(created.webview);
    });
    const messageListener = created.webview.onDidReceiveMessage((raw: unknown) => {
      receive(created.webview, raw);
    });
    const viewStateListener = created.onDidChangeViewState(() => {
      controller.setVisible(surface, created.visible);
    });
    created.onDidDispose(() => {
      followListener.dispose();
      messageListener.dispose();
      viewStateListener.dispose();
      controller.removeSurface(surface);
      if (panel === created) {
        panel = undefined;
      }
    });
  };

  const openInEditor = vscode.commands.registerCommand(
    'maestriBridge.chat.openInEditor',
    () => {
      if (panel !== undefined) {
        panel.reveal(undefined, false);
        return;
      }

      attachPanel(
        vscode.window.createWebviewPanel(
          'maestriBridge.chatPanel',
          t('chat.panel.title'),
          { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
          {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: resources(),
          },
        ),
      );
    },
  );

  const serializer = vscode.window.registerWebviewPanelSerializer('maestriBridge.chatPanel', {
    deserializeWebviewPanel: async (restored) => {
      if (panel !== undefined) {
        restored.dispose();
        return;
      }
      restored.title = t('chat.panel.title');
      attachPanel(restored);
    },
  });

  const openComposer = vscode.commands.registerCommand(
    'maestriBridge.openComposer',
    (seed?: ComposerSeed) => {
      void controller.open(seed);
    },
  );

  const configListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('maestriBridge.language') && panel !== undefined) {
      panel.title = t('chat.panel.title');
    }
  });

  return new vscode.Disposable(() => {
    openInEditor.dispose();
    serializer.dispose();
    openComposer.dispose();
    configListener.dispose();
    viewRegistration.dispose();
    panel?.dispose();
    panel = undefined;
    controller.dispose();
  });
}
