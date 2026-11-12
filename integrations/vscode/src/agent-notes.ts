import { isAbsolute, normalize } from 'node:path';
import * as vscode from 'vscode';
import { SHOW_LINK_PATH, locateTerminal, parseShowLink } from '@maestri-bridge/core';
import type { ShowLinkErrorCode } from '@maestri-bridge/core';
import type { AgentMonitor } from './agent-monitor.ts';
import { deliver } from './delivery.ts';
import { referencesForRange } from './editor-references.ts';
import { showFlowError } from './flow-errors.ts';
import { t } from './i18n/index.ts';
import type { MessageKey } from './i18n/index.ts';
import { NoteTours } from './notes-tour.ts';
import type { StopLocation, TourStop } from './notes-tour.ts';
import type { ExtensionServices } from './services.ts';
import type { AgentTarget } from './target-memory.ts';

const ERROR_KEYS: Record<ShowLinkErrorCode, MessageKey> = {
  missingFile: 'notes.error.missingFile',
  fileTooLong: 'notes.error.fileTooLong',
  invalidLines: 'notes.error.invalidLines',
  textTooLong: 'notes.error.textTooLong',
  invalidAgent: 'notes.error.invalidAgent',
  nameTooLong: 'notes.error.nameTooLong',
};

export function registerAgentNotes(
  services: ExtensionServices,
  monitor: AgentMonitor,
): vscode.Disposable {
  const controller = vscode.comments.createCommentController('maestriBridgeNotes', 'Maestri');
  controller.options = {
    prompt: t('notes.reply.prompt'),
    placeHolder: t('notes.reply.placeholder'),
  };

  const tours = new NoteTours<vscode.CommentThread>();
  const threadAgent = new Map<vscode.CommentThread, { agentId?: string; name: string }>();

  const disposeThread = (thread: vscode.CommentThread): void => {
    threadAgent.delete(thread);
    thread.dispose();
  };

  const updateLabels = (agentKey: string): void => {
    const stops = tours.stops(agentKey);
    const total = stops.length;
    stops.forEach((stop, index) => {
      const info = threadAgent.get(stop.thread);
      const name = info?.name ?? t('notes.author.agent');
      stop.thread.label =
        total === 1
          ? t('notes.label.single', { name })
          : t('notes.label', { name, index: index + 1, total });
    });
  };

  const rangeFor = (
    document: vscode.TextDocument,
    location: StopLocation,
  ): vscode.Range => {
    const lastLine = Math.max(0, document.lineCount - 1);
    const first = Math.min(lastLine, Math.max(0, (location.startLine ?? 1) - 1));
    const last = Math.min(
      lastLine,
      Math.max(first, (location.endLine ?? location.startLine ?? 1) - 1),
    );
    return new vscode.Range(first, 0, last, document.lineAt(last).text.length);
  };

  const revealStop = async (stop: TourStop<vscode.CommentThread>): Promise<void> => {
    const document = await vscode.workspace.openTextDocument(stop.thread.uri);
    const range = stop.thread.range ?? rangeFor(document, stop);
    const options: vscode.TextDocumentShowOptions = { preserveFocus: false };
    if (stop.startLine !== undefined) {
      options.selection = range;
    }
    const editor = await vscode.window.showTextDocument(stop.thread.uri, options);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    stop.thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
  };

  const showNotFound = (name: string, file: string): undefined => {
    void vscode.window.showWarningMessage(t('notes.error.notFound', { name, file }));
    return undefined;
  };

  const exists = async (uri: vscode.Uri): Promise<boolean> => {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  };

  const resolveFile = async (file: string, name: string): Promise<vscode.Uri | undefined> => {
    const absolute = isAbsolute(file);
    const absolutePath = absolute ? vscode.Uri.file(normalize(file)).path : undefined;

    let insideAnyFolder = false;
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const uri =
        absolutePath !== undefined
          ? folder.uri.with({ path: absolutePath })
          : vscode.Uri.joinPath(folder.uri, file.replaceAll('\\', '/'));
      if (vscode.workspace.getWorkspaceFolder(uri) === undefined) {
        continue;
      }
      insideAnyFolder = true;
      if (await exists(uri)) {
        return uri;
      }
    }

    if (absolute && !insideAnyFolder) {
      void vscode.window.showWarningMessage(t('notes.error.outsideWorkspace', { name, file }));
      return undefined;
    }
    return showNotFound(name, file);
  };

  const agentLinksEnabled = (): boolean =>
    vscode.workspace.getConfiguration('maestriBridge').get<boolean>('agentLinks', true);

  const handleUri = async (uri: vscode.Uri): Promise<void> => {
    if (uri.path !== SHOW_LINK_PATH) {
      return;
    }

    try {
      if (!agentLinksEnabled()) {
        void vscode.window.showWarningMessage(t('notes.error.disabled'));
        return;
      }

      const result = parseShowLink(uri.query);
      if (!result.ok) {
        void vscode.window.showWarningMessage(t(ERROR_KEYS[result.error]));
        return;
      }

      const request = result.request;
      const terminal =
        request.agentId === undefined
          ? undefined
          : monitor.snapshot?.terminals.find((item) => item.id === request.agentId);
      const name = request.from ?? terminal?.name ?? t('notes.author.agent');

      const fileUri = await resolveFile(request.file, name);
      if (fileUri === undefined) {
        return;
      }

      const document = await vscode.workspace.openTextDocument(fileUri);
      const location: StopLocation = { file: fileUri.fsPath };
      if (request.startLine !== undefined) {
        location.startLine = request.startLine;
      }
      if (request.endLine !== undefined) {
        location.endLine = request.endLine;
      }
      const range = rangeFor(document, location);

      if (request.text === undefined) {
        const options: vscode.TextDocumentShowOptions = { preserveFocus: false };
        if (request.startLine !== undefined) {
          options.selection = range;
        }
        const editor = await vscode.window.showTextDocument(fileUri, options);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        return;
      }

      const agentKey = request.agentId ?? request.from ?? 'agent';
      const { started, dropped } = tours.begin(agentKey, request.newTour);
      for (const thread of dropped) {
        disposeThread(thread);
      }

      const existing = tours.find(agentKey, location);
      const comment: vscode.Comment = {
        body: markdown(request.text),
        mode: vscode.CommentMode.Preview,
        author: { name },
        contextValue: 'maestri.note.agent',
        timestamp: new Date(),
      };

      if (existing !== undefined) {
        existing.thread.comments = [...existing.thread.comments, comment];
        updateLabels(agentKey);
        await revealStop(existing);
        return;
      }

      const thread = controller.createCommentThread(fileUri, range, [comment]);
      thread.canReply = request.agentId !== undefined;
      thread.contextValue =
        request.agentId !== undefined ? 'maestri.note.reply' : 'maestri.note';
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;

      const stop: TourStop<vscode.CommentThread> = { file: fileUri.fsPath, thread };
      if (request.startLine !== undefined) {
        stop.startLine = request.startLine;
      }
      if (request.endLine !== undefined) {
        stop.endLine = request.endLine;
      }
      tours.push(agentKey, stop);
      threadAgent.set(thread, { agentId: request.agentId, name });
      updateLabels(agentKey);

      if (started) {
        await revealStop(stop);
      } else {
        const position = tours.position(thread);
        vscode.window.setStatusBarMessage(
          t('notes.added', {
            name,
            index: (position?.index ?? 0) + 1,
            total: position?.total ?? 1,
          }),
          6000,
        );
      }
    } catch (error) {
      await showFlowError(services.session, error);
    }
  };

  const stopAtSelection = (agentKey: string): TourStop<vscode.CommentThread> | undefined => {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      return undefined;
    }
    const line = editor.selection.active.line + 1;
    return tours.stops(agentKey).find((stop) => {
      if (stop.file !== editor.document.uri.fsPath) {
        return false;
      }
      const start = stop.startLine ?? 1;
      const end = stop.endLine ?? start;
      return line >= start && line <= end;
    });
  };

  const firstOrLast = (
    agentKey: string,
    direction: 1 | -1,
  ): TourStop<vscode.CommentThread> | undefined => {
    const stops = tours.stops(agentKey);
    return direction === 1 ? stops[0] : stops.at(-1);
  };

  const navigate = async (
    direction: 1 | -1,
    thread?: vscode.CommentThread,
  ): Promise<void> => {
    try {
      let base: TourStop<vscode.CommentThread> | undefined;
      if (thread !== undefined) {
        const position = tours.position(thread);
        if (position !== undefined) {
          base = tours.stops(position.agentKey)[position.index];
        }
      }

      if (base === undefined) {
        const agentKey = tours.latestAgent();
        if (agentKey === undefined) {
          void vscode.window.showInformationMessage(t('notes.empty'));
          return;
        }
        base = stopAtSelection(agentKey) ?? firstOrLast(agentKey, direction);
      }

      if (base === undefined) {
        void vscode.window.showInformationMessage(t('notes.empty'));
        return;
      }

      const next = tours.neighbor(base.thread, direction);
      if (next !== undefined) {
        await revealStop(next);
      }
    } catch (error) {
      await showFlowError(services.session, error);
    }
  };

  const close = (thread?: vscode.CommentThread): void => {
    if (thread === undefined) {
      return;
    }
    const agentKey = tours.remove(thread);
    disposeThread(thread);
    if (agentKey !== undefined) {
      updateLabels(agentKey);
    }
  };

  const clearAll = (): void => {
    for (const thread of tours.clear()) {
      disposeThread(thread);
    }
  };

  const reply = async (commentReply: vscode.CommentReply): Promise<void> => {
    try {
      const text = commentReply.text.trim();
      if (text === '') {
        void vscode.window.showWarningMessage(t('compose.thread.emptyMessage'));
        return;
      }

      const thread = commentReply.thread;
      const info = threadAgent.get(thread);
      if (info?.agentId === undefined) {
        void vscode.window.showWarningMessage(t('notes.error.noAgent'));
        return;
      }

      const client = await services.session.ensureClient();
      if (client === undefined) {
        return;
      }

      const snapshot = monitor.snapshot;
      const located = await locateTerminal(client, info.agentId, {
        snapshots: snapshot === undefined ? [] : [snapshot],
        preferredWorkspaceId: snapshot?.workspace.id,
      });
      if (located === undefined) {
        void vscode.window.showWarningMessage(
          t('notes.error.agentNotFound', { name: info.name }),
        );
        return;
      }

      const target: AgentTarget = {
        workspaceId: located.workspace.id,
        workspaceName: located.workspace.name,
        terminalId: located.terminal.id,
        terminalName: located.terminal.name,
      };
      if (located.terminal.floorId !== undefined) {
        target.floorId = located.terminal.floorId;
      }
      if (located.terminal.floorName !== undefined) {
        target.floorName = located.terminal.floorName;
      }

      const document = await vscode.workspace.openTextDocument(thread.uri);
      const range = thread.range ?? rangeFor(document, { file: document.uri.fsPath });
      const references = referencesForRange(document, range);
      const ok = await deliver({
        session: services.session,
        client,
        memory: services.memory,
        target,
        message: text,
        references,
        notifySuccess: false,
      });

      if (ok) {
        thread.comments = [
          ...thread.comments,
          {
            body: markdown(text),
            mode: vscode.CommentMode.Preview,
            author: { name: t('notes.author.you') },
            contextValue: 'maestri.note.you',
            timestamp: new Date(),
          },
        ];
        const position = tours.position(thread);
        if (position !== undefined) {
          tours.touch(position.agentKey);
        }
      }
    } catch (error) {
      await showFlowError(services.session, error);
    }
  };

  const next = vscode.commands.registerCommand(
    'maestriBridge.notes.next',
    (thread?: vscode.CommentThread) => navigate(1, thread),
  );
  const previous = vscode.commands.registerCommand(
    'maestriBridge.notes.previous',
    (thread?: vscode.CommentThread) => navigate(-1, thread),
  );
  const closeCommand = vscode.commands.registerCommand('maestriBridge.notes.close', close);
  const clearAllCommand = vscode.commands.registerCommand('maestriBridge.notes.clearAll', clearAll);
  const replyCommand = vscode.commands.registerCommand('maestriBridge.notes.reply', reply);
  const uriHandler = vscode.window.registerUriHandler({ handleUri });

  return new vscode.Disposable(() => {
    next.dispose();
    previous.dispose();
    closeCommand.dispose();
    clearAllCommand.dispose();
    replyCommand.dispose();
    uriHandler.dispose();
    clearAll();
    controller.dispose();
  });
}

function markdown(text: string): vscode.MarkdownString {
  const value = new vscode.MarkdownString(text);
  value.isTrusted = false;
  value.supportHtml = false;
  value.supportThemeIcons = false;
  return value;
}
