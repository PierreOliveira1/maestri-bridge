import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { parseActivityLink, ACTIVITY_LINK_PATH } from '@maestri-bridge/core';
import type { AgentMonitor } from './agent-monitor.ts';
import { pickAgent, toAgentTarget } from './agent-picker.ts';
import { deliver } from './delivery.ts';
import { referencesForRange } from './editor-references.ts';
import { FollowEditor } from './follow-editor.ts';
import { followAccent, followPresentation } from './follow-presentation.ts';
import { enqueueFollowActivity, pauseFollow, receiveFollowActivity, resumeFollow, startFollow } from './follow-state.ts';
import type { FollowActivity, FollowState, FollowSummary } from './follow-state.ts';
import { showFlowError } from './flow-errors.ts';
import { t } from './i18n/index.ts';
import type { ExtensionServices } from './services.ts';
import type { AgentTarget } from './target-memory.ts';

export class AgentFollow implements vscode.Disposable {
  private readonly changes = new vscode.EventEmitter<void>();
  private readonly fileChanges = new vscode.EventEmitter<vscode.Uri | undefined>();
  readonly onDidChange = this.changes.event;
  private readonly editor = new FollowEditor();
  private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 95);
  private readonly subscriptions: vscode.Disposable[] = [];
  private state: FollowState | undefined;
  private target: AgentTarget | undefined;
  private root: vscode.Uri | undefined;
  private generation = 0;
  private startRequest = 0;
  private timer: NodeJS.Timeout | undefined;
  private queued: FollowActivity[] = [];
  private rendering = false;
  private file: string | undefined;
  private note: FollowSummary['note'];
  private disposed = false;
  private decoratedUri: vscode.Uri | undefined;

  get summary(): FollowSummary | undefined {
    return this.state && this.target
      ? {
        agentId: this.target.terminalId, name: this.target.terminalName, phase: this.state.phase,
        workspaceName: this.target.workspaceName, rootPath: this.root?.fsPath, file: this.file, note: this.note,
      }
      : undefined;
  }

  constructor(private readonly services: ExtensionServices, private readonly monitor: AgentMonitor) {
    this.status.name = t('follow.title');
    this.subscriptions.push(
      vscode.window.registerFileDecorationProvider({
        onDidChangeFileDecorations: this.fileChanges.event,
        provideFileDecoration: (uri) => {
          const current = this.editor.uri;
          const summary = this.summary;
          if (!current || !summary || uri.scheme !== 'file') return undefined;
          const same = process.platform === 'win32'
            ? current.fsPath.toLowerCase() === uri.fsPath.toLowerCase()
            : current.fsPath === uri.fsPath;
          if (!same) return undefined;
          return {
            badge: summary.phase === 'paused' ? 'Ⅱ' : '◎',
            tooltip: followPresentation(summary).label,
            color: new vscode.ThemeColor(followAccent(summary.agentId).themeColor),
            propagate: false,
          };
        },
      }),
      vscode.commands.registerCommand('maestriBridge.follow.start', (node: unknown) => this.start(node)),
      vscode.commands.registerCommand('maestriBridge.follow.pause', () => this.pause()),
      vscode.commands.registerCommand('maestriBridge.follow.resume', () => this.resume()),
      vscode.commands.registerCommand('maestriBridge.follow.stop', () => this.stop()),
      vscode.commands.registerCommand('maestriBridge.follow.reply', (reply: vscode.CommentReply) => this.reply(reply)),
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (event.kind === vscode.TextEditorSelectionChangeKind.Keyboard ||
          event.kind === vscode.TextEditorSelectionChangeKind.Mouse ||
          (event.kind !== vscode.TextEditorSelectionChangeKind.Command && !this.editor.isOwnNavigation(event.textEditor.document.uri))) this.pause();
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && !this.editor.isOwnNavigation(editor.document.uri)) this.pause();
      }),
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        if (event.textEditor === vscode.window.activeTextEditor && !this.editor.isOwnNavigation(event.textEditor.document.uri)) this.pause();
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.isDirty) this.pause();
      }),
      vscode.window.onDidChangeWindowState((event) => { if (!event.focused) this.pause(); }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.stop()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('maestriBridge.agentLinks') && !this.enabled()) this.stop();
      }),
      services.session.onDidChangeCredentials(() => this.stop()),
      monitor.onDidChange(() => this.checkContext()),
    );
    this.update();
  }

  async handleUri(uri: vscode.Uri): Promise<void> {
    if (uri.path !== ACTIVITY_LINK_PATH || !this.enabled() || !vscode.workspace.isTrusted || !this.state) return;
    const parsed = parseActivityLink(uri.query);
    if (!parsed.ok) return;
    const outcome = receiveFollowActivity(this.state, parsed.event);
    this.state = outcome.state;
    if (!outcome.activity) return;
    if (outcome.activity.kind === 'finish') {
      this.generation++;
      this.cancelQueued();
      this.editor.clear();
      this.update();
      return;
    }
    this.queueRender(outcome.activity);
  }

  private queueRender(event: FollowActivity, delay = 200): void {
    this.queued = enqueueFollowActivity(this.queued, event);
    if (this.timer !== undefined || this.rendering) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.renderQueued();
    }, delay);
  }

  private async renderQueued(): Promise<void> {
    this.rendering = true;
    try {
      for (let event = this.queued.shift(); event; event = this.queued.shift()) {
        await this.render(event);
      }
    } finally {
      this.rendering = false;
    }
  }

  private enabled(): boolean {
    return vscode.workspace.getConfiguration('maestriBridge').get<boolean>('agentLinks', true);
  }

  private async start(node: unknown): Promise<void> {
    try {
      if (!this.enabled()) {
        void vscode.window.showWarningMessage(t('follow.unavailable'));
        return;
      }
      const request = ++this.startRequest;
      const folders = (vscode.workspace.workspaceFolders ?? []).filter((folder) => folder.uri.scheme === 'file');
      if (folders.length === 0) {
        const action = t('follow.openProject');
        const selected = await vscode.window.showWarningMessage(t('follow.openFolder'), action);
        if (selected === action && request === this.startRequest && !this.disposed) {
          const [folder] = await vscode.window.showOpenDialog({
            canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: action,
          }) ?? [];
          if (folder?.scheme === 'file' && request === this.startRequest && !this.disposed) {
            await vscode.commands.executeCommand('vscode.openFolder', folder, { forceNewWindow: true });
          }
        }
        return;
      }
      if (!vscode.workspace.isTrusted) {
        void vscode.window.showWarningMessage(t('follow.unavailable'));
        return;
      }
      const current = (): boolean => request === this.startRequest && !this.disposed &&
        this.enabled() && vscode.workspace.isTrusted;
      const client = await this.services.session.ensureClient();
      if (!client || !current()) return;
      let target: AgentTarget | undefined;
      if (typeof node === 'object' && node !== null && 'terminal' in node) {
        const value = node as { terminal?: { id?: unknown } };
        const terminal = this.monitor.snapshot?.terminals.find((item) => item.id === value.terminal?.id);
        const workspace = this.monitor.snapshot?.workspace;
        if (terminal && workspace) {
          target = {
            workspaceId: workspace.id, workspaceName: workspace.name,
            terminalId: terminal.id, terminalName: terminal.name,
            floorId: terminal.floorId, floorName: terminal.floorName,
          };
        }
        if (!target) {
          void vscode.window.showWarningMessage(t('follow.agentUnavailable'));
          return;
        }
      }
      if (!target) {
        const picked = await pickAgent({
          session: this.services.session, client, memory: this.services.memory,
          references: [], title: t('follow.title'), placeholder: t('follow.pickAgent'),
          selectedWorkspaceId: this.monitor.workspaceId,
          includeTerminalPreview: false,
        });
        if (!picked || !current()) return;
        target = toAgentTarget(picked);
      }
      const folder = folders.length === 1 ? folders[0] : (await vscode.window.showQuickPick(
        folders.map((item) => ({ label: item.name, description: item.uri.fsPath, folder: item })),
        { title: t('follow.chooseRoot'), placeHolder: `${target.terminalName} · ${target.workspaceName}` },
      ))?.folder;
      if (!folder || !current()) return;
      const snapshot = await client.getFeed(target.workspaceId, target.floorId);
      if (!current()) return;
      if (!snapshot.terminals.some((item) => item.id === target.terminalId)) {
        void vscode.window.showWarningMessage(t('follow.agentUnavailable'));
        return;
      }
      const activityUri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://maestri-bridge.maestri-bridge/activity`));
      if (!current() || !vscode.workspace.workspaceFolders?.some((item) => item.uri.toString() === folder.uri.toString())) return;
      this.stop();
      this.monitor.setWorkspace(target.workspaceId, target.floorId);
      this.editor.begin(vscode.workspace.getConfiguration('maestriBridge').get('follow.previewPosition') === 'beside');
      this.target = target;
      this.root = folder.uri;
      this.state = startFollow(randomUUID(), target.terminalId);
      const sessionId = this.state.sessionId;
      const helper = vscode.Uri.joinPath(this.services.context.extensionUri, 'dist', 'emit-activity.mjs').fsPath;
      this.update();
      const instructions = [
        t('follow.instructions'),
        `Session: ${sessionId}; agent: ${target.terminalId}; root: ${folder.uri.fsPath}.`,
        `Helper: ${helper}`,
        `Editor executable: ${process.execPath}`,
        `URI base: ${activityUri.toString()}`,
        'After each meaningful saved change, run node <helper> decision <relative POSIX path:start-end> <short explanation> --session <session> --agent <agent> --seq <increasing integer> --root <root> --editor-path <editor executable> --uri-base <URI base>. Quote each argument for your shell.',
        'In one or two sentences explain what the highlighted code does and why you are changing it. Use the user’s language and describe the actual saved change. Use focus <file:start-end> for navigation alone. Send finish only when the task is complete, with the same options except file. Never publish secrets or private files.',
      ].join('\n');
      try {
        await client.sendPrompt(target.terminalId, instructions);
      } catch (error) {
        if (this.state?.sessionId === sessionId) this.stop();
        throw error;
      }
    } catch (error) {
      await showFlowError(this.services.session, error);
    }
  }

  private pause(message = t('follow.paused')): void {
    if (this.state?.phase !== 'following') return;
    this.state = pauseFollow(this.state);
    this.generation++;
    this.cancelQueued();
    this.update(message);
  }

  private resume(): void {
    if (this.state?.phase !== 'paused' || !this.enabled()) return;
    const outcome = resumeFollow(this.state);
    this.state = outcome.state;
    this.update();
    if (outcome.activity) this.queueRender(outcome.activity, 0);
  }

  private async render(event: FollowActivity): Promise<void> {
    if (this.state?.phase !== 'following' || !this.root || !this.target || !vscode.window.state.focused) return;
    const epoch = this.generation;
    const current = (): boolean => !this.disposed && epoch === this.generation &&
      this.state?.phase === 'following' && this.state.sessionId === event.sessionId && this.enabled();
    try {
      const shown = await this.editor.show(this.root, event, this.target.terminalName, current);
      if (!current()) return;
      if (!shown) {
        if (this.queued.length === 0) this.pause(t('follow.stale'));
        return;
      }
      this.file = event.file;
      if (event.kind === 'decision' && event.file && event.range && event.message) {
        this.note = { file: event.file, ...event.range, message: event.message };
      }
      this.update();
    } catch {
      if (current() && this.queued.length === 0) this.pause(t('follow.stale'));
    }
  }

  private checkContext(): void {
    if (!this.state || !this.target) return;
    const snapshot = this.monitor.snapshot;
    if (this.monitor.lastError !== undefined || this.monitor.workspaceId !== this.target.workspaceId ||
      this.monitor.floorId !== this.target.floorId ||
      (snapshot && !snapshot.terminals.some((item) => item.id === this.target?.terminalId))) {
      this.stop();
    }
  }

  private async reply(reply: vscode.CommentReply): Promise<void> {
    if (!reply?.thread || !this.editor.owns(reply.thread) || !reply.text.trim() || !this.target) return;
    const target = this.target;
    const client = await this.services.session.currentClient();
    if (!client) return;
    try {
      const snapshot = await client.getFeed(target.workspaceId, target.floorId);
      if (this.target !== target || !snapshot.terminals.some((item) => item.id === target.terminalId)) return;
      const document = await vscode.workspace.openTextDocument(reply.thread.uri);
      const range = reply.thread.range;
      if (!range || this.target !== target || !this.editor.owns(reply.thread)) return;
      await deliver({
        session: this.services.session, client, memory: this.services.memory, target,
        message: reply.text.trim(), references: referencesForRange(document, range), notifySuccess: false,
      });
    } catch (error) { await showFlowError(this.services.session, error); }
  }

  private update(message?: string): void {
    const phase = this.state?.phase;
    void vscode.commands.executeCommand('setContext', 'maestriBridge.following', phase === 'following');
    void vscode.commands.executeCommand('setContext', 'maestriBridge.followPaused', phase === 'paused');
    void vscode.commands.executeCommand('setContext', 'maestriBridge.followActive', phase === 'following' || phase === 'paused');
    this.changes.fire();
    if (this.decoratedUri) this.fileChanges.fire(this.decoratedUri);
    if (this.editor.uri && this.editor.uri.toString() !== this.decoratedUri?.toString()) this.fileChanges.fire(this.editor.uri);
    this.decoratedUri = this.editor.uri;
    if (!phase || !this.target) { this.status.hide(); return; }
    const icon = phase === 'paused' ? 'debug-pause' : phase === 'completed' ? 'check' : 'target';
    this.status.text = `$(${icon}) ${message ?? t(phase === 'completed' ? 'follow.completed' : phase === 'paused' ? 'follow.paused' : 'follow.active', { name: this.target.terminalName })}${phase === 'paused' ? ` · ${this.target.terminalName}` : ''}${this.file ? ` · ${this.file}` : ''}`;
    this.status.tooltip = `${t('follow.cooperative')}\n${this.root?.fsPath ?? ''}`;
    this.status.color = new vscode.ThemeColor(followAccent(this.target.terminalId).themeColor);
    this.status.command = phase === 'paused' ? 'maestriBridge.follow.resume' : phase === 'completed' ? 'maestriBridge.follow.start' : 'maestriBridge.follow.pause';
    this.status.show();
  }

  private cancelQueued(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.queued = [];
  }

  private stop(): void {
    this.startRequest++;
    this.generation++;
    this.cancelQueued();
    this.state = undefined;
    this.target = undefined;
    this.root = undefined;
    this.file = undefined;
    this.note = undefined;
    this.editor.clear();
    this.update();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    for (const subscription of this.subscriptions) subscription.dispose();
    this.editor.dispose();
    this.status.dispose();
    this.changes.dispose();
    this.fileChanges.dispose();
  }
}
