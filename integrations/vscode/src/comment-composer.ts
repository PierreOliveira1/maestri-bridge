import * as vscode from 'vscode';
import type { CodeReference } from '@maestri-bridge/core';
import { pickAgent, toAgentTarget } from './agent-picker.ts';
import { fullLineRange, threadLabel } from './compose-labels.ts';
import { deliver } from './delivery.ts';
import { DoublePress } from './double-press.ts';
import { referencesForRange } from './editor-references.ts';
import { showFlowError } from './flow-errors.ts';
import { t } from './i18n/index.ts';
import { referencePath } from './references.ts';
import type { ExtensionServices, ComposerSeed } from './services.ts';
import type { AgentTarget } from './target-memory.ts';

const DOUBLE_PRESS_MS = 600;

export function registerCommentComposer(services: ExtensionServices): vscode.Disposable {
  const controller = vscode.comments.createCommentController('maestriBridge', 'Maestri');
  controller.options = {
    prompt: t('compose.thread.prompt'),
    placeHolder: t('compose.thread.placeholder'),
  };

  const targets = new Map<vscode.CommentThread, AgentTarget>();
  const drafts = new Set<vscode.CommentThread>();
  const draftThreads = new Map<vscode.Comment, vscode.CommentThread>();
  const doublePress = new DoublePress(DOUBLE_PRESS_MS);
  let pendingDraft: Promise<vscode.CommentThread | undefined> | undefined;

  const closeDraft = (thread: vscode.CommentThread): void => {
    targets.delete(thread);
    drafts.delete(thread);
    for (const comment of thread.comments) {
      draftThreads.delete(comment);
    }
    thread.dispose();
  };

  const latestDraft = (): vscode.CommentThread | undefined => [...drafts].at(-1);

  const rangeProvider: vscode.CommentingRangeProvider = {
    provideCommentingRanges: (document) => {
      if (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled') {
        return [];
      }
      return [new vscode.Range(0, 0, Math.max(0, document.lineCount - 1), 0)];
    },
  };

  const updateRangeProvider = (): void => {
    const enabled = vscode.workspace
      .getConfiguration('maestriBridge')
      .get<boolean>('gutterButton', true);
    controller.commentingRangeProvider = enabled ? rangeProvider : undefined;
  };

  updateRangeProvider();

  const referencesOf = async (thread: vscode.CommentThread): Promise<CodeReference[]> => {
    const document = await vscode.workspace.openTextDocument(thread.uri);
    if (thread.range !== undefined) {
      return referencesForRange(document, thread.range);
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    return [
      {
        path: referencePath(document.uri.fsPath, workspaceFolder?.uri.fsPath),
        language: document.languageId,
      },
    ];
  };

  const updateLabel = async (thread: vscode.CommentThread): Promise<void> => {
    try {
      const references = await referencesOf(thread);
      thread.label = threadLabel(references, targets.get(thread)?.terminalName);
    } catch (error) {
      await showFlowError(services.session, error);
    }
  };

  const createDraft = async (): Promise<vscode.CommentThread | undefined> => {
    try {
      const client = await services.session.ensureClient();
      if (client === undefined) {
        return undefined;
      }

      const editor = vscode.window.activeTextEditor;
      if (editor === undefined) {
        void vscode.window.showWarningMessage(t('compose.editor.noEditor'));
        return undefined;
      }

      const document = editor.document;
      const selection = editor.selection;
      const range = selection.isEmpty
        ? fullLineRange(
            selection.active.line,
            document.lineAt(selection.active.line).text.length,
          )
        : {
            startLine: selection.start.line,
            startCharacter: selection.start.character,
            endLine: selection.end.line,
            endCharacter: selection.end.character,
          };

      const thread = controller.createCommentThread(
        document.uri,
        new vscode.Range(
          range.startLine,
          range.startCharacter,
          range.endLine,
          range.endCharacter,
        ),
        [],
      );
      const draft: vscode.Comment = {
        body: '',
        mode: vscode.CommentMode.Editing,
        author: { name: t('compose.draft.author') },
        contextValue: 'maestri.draft',
      };
      thread.comments = [draft];
      thread.canReply = false;
      thread.contextValue = 'maestri.draft';
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
      drafts.add(thread);
      draftThreads.set(draft, thread);

      const last = services.memory.lastTarget();
      if (last !== undefined) {
        targets.set(thread, last);
      }
      void updateLabel(thread);
      return thread;
    } catch (error) {
      await showFlowError(services.session, error);
      return undefined;
    }
  };

  const moveToComposer = async (thread: vscode.CommentThread | undefined): Promise<void> => {
    try {
      if (thread === undefined) {
        await vscode.commands.executeCommand('maestriBridge.openComposer');
        return;
      }
      const references = await referencesOf(thread);
      const seed: ComposerSeed = { references, target: targets.get(thread) };
      await vscode.commands.executeCommand('maestriBridge.openComposer', seed);
      closeDraft(thread);
    } catch (error) {
      await showFlowError(services.session, error);
    }
  };

  const compose = vscode.commands.registerCommand('maestriBridge.compose', async () => {
    const draft = pendingDraft;
    if (doublePress.press() && draft !== undefined) {
      pendingDraft = undefined;
      const thread = await draft;
      if (thread !== undefined && drafts.has(thread)) {
        await moveToComposer(thread);
      }
      return;
    }
    pendingDraft = createDraft();
    await pendingDraft;
  });

  const send = vscode.commands.registerCommand(
    'maestriBridge.thread.send',
    async (comment: vscode.Comment) => {
      try {
        const thread = draftThreads.get(comment);
        if (thread === undefined) {
          return;
        }
        const message = commentText(comment).trim();
        if (message === '') {
          void vscode.window.showWarningMessage(t('compose.thread.emptyMessage'));
          return;
        }

        const client = await services.session.ensureClient();
        if (client === undefined) {
          return;
        }

        const references = await referencesOf(thread);
        let target = targets.get(thread) ?? services.memory.lastTarget();
        if (target === undefined) {
          const picked = await pickAgent({
            session: services.session,
            client,
            memory: services.memory,
            references,
            filePath: thread.uri.fsPath,
            title: t('compose.pickAgent.title'),
          });
          if (picked === undefined) {
            return;
          }
          target = toAgentTarget(picked);
          targets.set(thread, target);
          void updateLabel(thread);
        }

        const ok = await deliver({
          session: services.session,
          client,
          memory: services.memory,
          target,
          message,
          references,
        });
        if (ok) {
          closeDraft(thread);
        }
      } catch (error) {
        await showFlowError(services.session, error);
      }
    },
  );

  const cancel = vscode.commands.registerCommand(
    'maestriBridge.thread.cancel',
    (comment: vscode.Comment) => {
      const thread = draftThreads.get(comment);
      if (thread !== undefined) {
        closeDraft(thread);
      }
    },
  );

  const pick = vscode.commands.registerCommand(
    'maestriBridge.thread.pickAgent',
    async (thread: vscode.CommentThread) => {
      try {
        const client = await services.session.ensureClient();
        if (client === undefined) {
          return;
        }
        const references = await referencesOf(thread);
        const picked = await pickAgent({
          session: services.session,
          client,
          memory: services.memory,
          references,
          filePath: thread.uri.fsPath,
          title: t('compose.changeAgent.title'),
        });
        if (picked === undefined) {
          return;
        }
        targets.set(thread, toAgentTarget(picked));
        void updateLabel(thread);
      } catch (error) {
        await showFlowError(services.session, error);
      }
    },
  );

  const openInComposer = vscode.commands.registerCommand(
    'maestriBridge.thread.openInComposer',
    async (thread?: vscode.CommentThread) => {
      pendingDraft = undefined;
      await moveToComposer(thread ?? latestDraft());
    },
  );

  const configListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('maestriBridge.gutterButton')) {
      updateRangeProvider();
    }
  });

  return new vscode.Disposable(() => {
    compose.dispose();
    send.dispose();
    cancel.dispose();
    pick.dispose();
    openInComposer.dispose();
    configListener.dispose();
    for (const thread of drafts) {
      thread.dispose();
    }
    drafts.clear();
    draftThreads.clear();
    targets.clear();
    controller.dispose();
  });
}

function commentText(comment: vscode.Comment): string {
  return typeof comment.body === 'string' ? comment.body : comment.body.value;
}
