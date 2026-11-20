import * as vscode from 'vscode';
import { checkActivityTarget } from '@maestri-bridge/core';
import { resolveFollowFile } from './follow-file.ts';
import { sameFollowLocation } from './follow-state.ts';
import type { FollowActivity } from './follow-state.ts';
import { t } from './i18n/index.ts';

const NAVIGATION_SETTLE_MS = 300;

export class FollowEditor implements vscode.Disposable {
  private readonly highlight = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('editor.rangeHighlightBackground'),
    border: '1px solid',
    borderColor: new vscode.ThemeColor('focusBorder'),
    overviewRulerColor: new vscode.ThemeColor('focusBorder'),
    overviewRulerLane: vscode.OverviewRulerLane.Center,
  });
  private readonly notes = vscode.comments.createCommentController('maestriBridgeFollow', 'Maestri');
  private thread: vscode.CommentThread | undefined;
  private threadActivity: FollowActivity | undefined;
  private editor: vscode.TextEditor | undefined;
  private ownNavigation: { target: string; previous?: string; settledAt?: number } | undefined;
  private column: vscode.ViewColumn | undefined;

  get uri(): vscode.Uri | undefined {
    return this.editor?.document?.uri;
  }

  begin(beside = false): void {
    const active = vscode.window.activeTextEditor?.viewColumn;
    this.column = beside && active !== undefined ? vscode.ViewColumn.Beside : active;
  }

  isOwnNavigation(uri: vscode.Uri): boolean {
    const navigation = this.ownNavigation;
    if (!navigation) return false;
    const path = uri.toString();
    if (navigation.settledAt === undefined) {
      return path === navigation.target || path === navigation.previous;
    }
    return path === navigation.target && Date.now() - navigation.settledAt < NAVIGATION_SETTLE_MS;
  }

  owns(thread: vscode.CommentThread): boolean {
    return this.thread === thread;
  }

  async show(
    root: vscode.Uri,
    event: FollowActivity,
    name: string,
    current: () => boolean,
  ): Promise<boolean> {
    if (!event.file || !event.range || !current()) return false;
    const file = await resolveFollowFile(root.fsPath, event.file);
    if (!file || !current()) return false;
    const uri = vscode.Uri.file(file);
    const document = await vscode.workspace.openTextDocument(uri);
    if (!current() || document.isClosed || document.getText().includes('\0') || !checkActivityTarget(event, {
      text: document.getText(), lineCount: document.lineCount, isDirty: document.isDirty,
    }).ok) return false;
    const range = new vscode.Range(event.range.startLine - 1, 0, event.range.endLine - 1, document.lineAt(event.range.endLine - 1).text.length);
    const navigation: NonNullable<FollowEditor['ownNavigation']> = {
      target: uri.toString(),
      previous: vscode.window.activeTextEditor?.document.uri.toString(),
    };
    this.ownNavigation = navigation;
    try {
      const editor = await vscode.window.showTextDocument(document, {
        preserveFocus: true, preview: true, viewColumn: this.column ?? vscode.ViewColumn.Active,
      });
      if (!current() || document.isDirty || !checkActivityTarget(event, {
        text: document.getText(), lineCount: document.lineCount, isDirty: document.isDirty,
      }).ok) return false;
      if (this.editor !== editor) this.editor?.setDecorations(this.highlight, []);
      this.editor = editor;
      this.column = editor.viewColumn ?? this.column;
      editor.setDecorations(this.highlight, [range]);
      if (this.threadActivity && (!sameFollowLocation(this.threadActivity, event) ||
        (event.kind === 'decision' && this.threadActivity.message !== event.message))) {
        this.clearThread();
      }
      if (!this.thread && event.kind === 'decision' && event.message) {
        this.thread = this.notes.createCommentThread(uri, range, [{
          body: new vscode.MarkdownString().appendText(event.message),
          mode: vscode.CommentMode.Preview,
          author: { name },
          timestamp: new Date(),
        }]);
        this.thread.label = t('follow.decision', { name });
        this.thread.canReply = true;
        this.thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
        this.threadActivity = event;
      }
      if (!editor.visibleRanges.some((visible) => visible.contains(range))) {
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      }
      return true;
    } finally {
      navigation.settledAt = Date.now();
    }
  }

  clear(): void {
    this.ownNavigation = undefined;
    this.editor?.setDecorations(this.highlight, []);
    this.editor = undefined;
    this.clearThread();
  }

  private clearThread(): void {
    this.thread?.dispose();
    this.thread = undefined;
    this.threadActivity = undefined;
  }

  dispose(): void {
    this.clear();
    this.highlight.dispose();
    this.notes.dispose();
  }
}
