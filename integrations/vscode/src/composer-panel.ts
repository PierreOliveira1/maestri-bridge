import * as vscode from 'vscode';
import { formatReferenceHeader } from '@maestri-bridge/core';
import type { CodeReference } from '@maestri-bridge/core';
import { pickAgent, toAgentTarget } from './agent-picker.ts';
import { composerHtml, createNonce } from './composer-html.ts';
import { parseFromWebview } from './composer-protocol.ts';
import type {
  ComposerNotice,
  ComposerReferenceView,
  ComposerState,
  ComposerTargetView,
  FromWebview,
  ToWebview,
} from './composer-protocol.ts';
import { collectReferences } from './editor-references.ts';
import { deliver } from './delivery.ts';
import { showFlowError } from './flow-errors.ts';
import { currentLocale, t } from './i18n/index.ts';
import type { ComposerSeed, ExtensionServices } from './services.ts';
import type { AgentTarget } from './target-memory.ts';

interface StoredReference {
  id: string;
  reference: CodeReference;
}

let composerPanel: vscode.WebviewPanel | undefined;
let lastEditor: vscode.TextEditor | undefined;
let references: StoredReference[] = [];
let referenceCounter = 0;
let target: AgentTarget | undefined;
let message = '';
let sending = false;
let notice: ComposerNotice | undefined;
let lastSentTerminalId: string | undefined;

const IS_MAC = process.platform === 'darwin';

export function registerComposer(services: ExtensionServices): vscode.Disposable {
  lastEditor = vscode.window.activeTextEditor;

  const editorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor !== undefined) {
      lastEditor = editor;
    }
  });

  const command = vscode.commands.registerCommand(
    'maestriBridge.openComposer',
    (seed?: ComposerSeed) => {
      void openComposer(services, seed);
    },
  );

  const configListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('maestriBridge.language')) {
      if (composerPanel !== undefined) {
        composerPanel.title = t('panel.title');
      }
      postState();
    }
  });

  return new vscode.Disposable(() => {
    command.dispose();
    editorListener.dispose();
    configListener.dispose();
    composerPanel?.dispose();
    composerPanel = undefined;
  });
}

async function openComposer(
  services: ExtensionServices,
  seed: ComposerSeed | undefined,
): Promise<void> {
  try {
    if (composerPanel !== undefined) {
      composerPanel.reveal(undefined, false);
      const active = vscode.window.activeTextEditor;
      if (seed === undefined && active !== undefined && !active.selection.isEmpty) {
        addReferences(collectReferences(active));
      }
      mergeSeed(seed);
      postState();
      post({ type: 'focusMessage' });
      return;
    }

    const editor = vscode.window.activeTextEditor ?? lastEditor;
    resetState();

    if (seed === undefined) {
      target = services.memory.lastTarget();
      if (editor !== undefined && !editor.selection.isEmpty) {
        addReferences(collectReferences(editor));
      }
    } else {
      target = seed.target ?? services.memory.lastTarget();
      message = seed.message ?? '';
      if (seed.references !== undefined) {
        addReferences(seed.references);
      }
    }

    const extensionUri = services.context.extensionUri;
    const panel = vscode.window.createWebviewPanel(
      'maestriBridge.composer',
      t('panel.title'),
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.joinPath(extensionUri, 'dist'),
        ],
      },
    );
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'maestri.svg');
    panel.webview.html = composerHtml({
      cspSource: panel.webview.cspSource,
      nonce: createNonce(),
      scriptUri: panel.webview
        .asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'composer.js'))
        .toString(),
      styleUri: panel.webview
        .asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'composer.css'))
        .toString(),
    });

    composerPanel = panel;

    const messageListener = panel.webview.onDidReceiveMessage((raw: unknown) => {
      const incoming = parseFromWebview(raw);
      if (incoming !== undefined) {
        void handleMessage(services, incoming);
      }
    });

    panel.onDidDispose(() => {
      messageListener.dispose();
      if (composerPanel === panel) {
        composerPanel = undefined;
      }
      resetState();
    });

    postState();
    post({ type: 'focusMessage' });
  } catch (error) {
    await showFlowError(services.session, error);
  }
}

async function handleMessage(
  services: ExtensionServices,
  incoming: FromWebview,
): Promise<void> {
  try {
    switch (incoming.type) {
      case 'ready':
        postState();
        return;
      case 'pickAgent': {
        const picked = await pickTarget(services);
        if (picked !== undefined) {
          target = picked;
          postState();
        }
        return;
      }
      case 'addSelection': {
        const editor = lastEditor;
        if (editor !== undefined && !editor.selection.isEmpty) {
          addReferences(collectReferences(editor));
        } else {
          notice = { kind: 'error', text: t('panel.notice.noSelection') };
        }
        postState();
        return;
      }
      case 'removeReference':
        references = references.filter((item) => item.id !== incoming.id);
        postState();
        return;
      case 'messageChanged':
        message = incoming.message;
        return;
      case 'send':
        await sendMessage(services, incoming.message);
        return;
      case 'openInMaestri': {
        const terminalId = lastSentTerminalId;
        if (terminalId === undefined) {
          return;
        }
        const client = await services.session.currentClient();
        if (client === undefined) {
          return;
        }
        await client.focusTerminal(terminalId);
        return;
      }
      case 'dismissNotice':
        notice = undefined;
        postState();
        return;
    }
  } catch (error) {
    await showFlowError(services.session, error);
  }
}

async function sendMessage(services: ExtensionServices, text: string): Promise<void> {
  message = text;

  let current = target;
  if (current === undefined) {
    current = await pickTarget(services);
    if (current === undefined) {
      return;
    }
    target = current;
  }

  const client = await services.session.ensureClient();
  if (client === undefined) {
    return;
  }

  sending = true;
  notice = undefined;
  postState();

  const ok = await deliver({
    session: services.session,
    client,
    memory: services.memory,
    target: current,
    message,
    references: references.map((item) => item.reference),
    notifySuccess: false,
  });

  sending = false;
  if (ok) {
    lastSentTerminalId = current.terminalId;
    message = '';
    references = [];
    notice = {
      kind: 'success',
      text: t('panel.notice.sent', { name: current.terminalName }),
      canOpenInMaestri: true,
    };
  } else {
    notice = {
      kind: 'error',
      text: t('panel.notice.sendFailed', { name: current.terminalName }),
    };
  }
  postState();
}

async function pickTarget(services: ExtensionServices): Promise<AgentTarget | undefined> {
  const client = await services.session.ensureClient();
  if (client === undefined) {
    return undefined;
  }

  const picked = await pickAgent({
    session: services.session,
    client,
    memory: services.memory,
    references: references.map((item) => item.reference),
    filePath: lastEditor?.document.uri.fsPath,
    title: t('compose.pickAgent.title'),
  });
  if (picked === undefined) {
    return undefined;
  }

  return toAgentTarget(picked);
}

function mergeSeed(seed: ComposerSeed | undefined): void {
  if (seed === undefined) {
    return;
  }
  if (seed.references !== undefined) {
    addReferences(seed.references);
  }
  if (seed.target !== undefined) {
    target = seed.target;
  }
  if (seed.message !== undefined && message === '') {
    message = seed.message;
  }
}

function addReferences(incoming: readonly CodeReference[]): void {
  const headers = new Set(references.map((item) => formatReferenceHeader(item.reference)));

  for (const reference of incoming) {
    const header = formatReferenceHeader(reference);
    if (headers.has(header)) {
      continue;
    }
    headers.add(header);
    referenceCounter += 1;
    references.push({ id: `ref-${referenceCounter}`, reference });
  }
}

function postState(): void {
  post({ type: 'state', state: currentState() });
}

function currentState(): ComposerState {
  const state: ComposerState = {
    references: references.map(referenceView),
    message,
    sending,
    isMac: IS_MAC,
    locale: currentLocale(),
  };
  if (target !== undefined) {
    state.target = targetView(target);
  }
  if (notice !== undefined) {
    state.notice = notice;
  }
  return state;
}

function referenceView(item: StoredReference): ComposerReferenceView {
  const reference = item.reference;
  const view: ComposerReferenceView = {
    id: item.id,
    header: formatReferenceHeader(reference),
    path: reference.path,
  };
  if (reference.startLine !== undefined) {
    view.startLine = reference.startLine;
  }
  if (reference.text !== undefined) {
    view.text = reference.text;
  }
  return view;
}

function targetView(value: AgentTarget): ComposerTargetView {
  const view: ComposerTargetView = {
    terminalName: value.terminalName,
    workspaceName: value.workspaceName,
  };
  if (value.floorName !== undefined) {
    view.floorText = value.floorName;
  }
  return view;
}

function post(payload: ToWebview): void {
  const panel = composerPanel;
  if (panel === undefined) {
    return;
  }
  void Promise.resolve(panel.webview.postMessage(payload)).catch(() => undefined);
}

function resetState(): void {
  references = [];
  referenceCounter = 0;
  target = undefined;
  message = '';
  sending = false;
  notice = undefined;
  lastSentTerminalId = undefined;
}
