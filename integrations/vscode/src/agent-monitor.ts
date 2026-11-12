import * as vscode from 'vscode';
import { detectNewAttention, FeedWatcher } from '@maestri-bridge/core';
import type { AttentionEvent, FeedSnapshot, WireClient, WorkspaceSummary } from '@maestri-bridge/core';
import type { ExtensionServices } from './services.ts';
import { t } from './i18n/index.ts';
import { chooseWorkspace } from './workspace-choice.ts';

const MONITOR_TARGET_KEY = 'maestriBridge.monitorTarget';
const WORKSPACE_REFRESH_MS = 15000;

interface MonitorTarget {
  workspaceId: string;
  floorId?: string;
}

export class AgentMonitor implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly attentionEmitter = new vscode.EventEmitter<AttentionEvent[]>();
  private readonly windowStateListener: vscode.Disposable;
  private readonly configurationListener: vscode.Disposable;
  private readonly credentialsListener: vscode.Disposable;
  private currentSnapshot: FeedSnapshot | undefined;
  private currentWorkspaces: WorkspaceSummary[] = [];
  private currentWorkspaceId: string | undefined;
  private currentFloorId: string | undefined;
  private currentError: unknown | undefined;
  private currentClient: WireClient | undefined;
  private watcher: FeedWatcher | undefined;
  private watcherListeners: Array<() => void> = [];
  private workspaceTimer: NodeJS.Timeout | undefined;
  private viewVisible = false;
  private generation = 0;
  private disposed = false;

  readonly onDidChange: vscode.Event<void>;
  readonly onDidDetectAttention: vscode.Event<AttentionEvent[]>;

  constructor(private readonly services: ExtensionServices) {
    this.onDidChange = this.changeEmitter.event;
    this.onDidDetectAttention = this.attentionEmitter.event;

    this.windowStateListener = vscode.window.onDidChangeWindowState(() => {
      this.applyPolicy();
    });
    this.configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('maestriBridge')) {
        this.applyPolicy();
      }
    });
    this.credentialsListener = services.session.onDidChangeCredentials(() => {
      this.reset();
      this.emitChange();
      void this.start();
    });
  }

  get snapshot(): FeedSnapshot | undefined {
    return this.currentSnapshot;
  }

  get workspaces(): WorkspaceSummary[] {
    return this.currentWorkspaces;
  }

  get workspaceId(): string | undefined {
    return this.currentWorkspaceId;
  }

  get floorId(): string | undefined {
    return this.currentFloorId;
  }

  get lastError(): unknown | undefined {
    return this.currentError;
  }

  get client(): WireClient | undefined {
    return this.currentClient;
  }

  async start(): Promise<void> {
    if (this.disposed) {
      return;
    }

    const generation = ++this.generation;
    let client: WireClient | undefined;
    try {
      client = await this.services.session.currentClient();
    } catch (error) {
      if (this.disposed || generation !== this.generation) {
        return;
      }
      this.currentClient = undefined;
      this.currentError = error;
      this.stopWatcher();
      this.clearWorkspaceTimer();
      this.emitChange();
      return;
    }

    if (this.disposed || generation !== this.generation) {
      return;
    }

    if (client === undefined) {
      this.currentClient = undefined;
      this.currentSnapshot = undefined;
      this.currentWorkspaces = [];
      this.currentWorkspaceId = undefined;
      this.currentFloorId = undefined;
      this.stopWatcher();
      this.clearWorkspaceTimer();
      this.emitChange();
      return;
    }

    this.currentClient = client;

    if (this.currentWorkspaceId === undefined) {
      await this.selectInitialWorkspace(client, generation);
      if (this.disposed || generation !== this.generation) {
        return;
      }
    }

    this.configureWatcher();
    this.applyPolicy();
    this.emitChange();
  }

  setViewVisible(visible: boolean): void {
    this.viewVisible = visible;
    this.applyPolicy();
  }

  setWorkspace(workspaceId: string, floorId?: string): void {
    if (this.disposed) {
      return;
    }

    this.currentWorkspaceId = workspaceId;
    this.currentFloorId = floorId;
    this.currentSnapshot = undefined;
    this.currentError = undefined;

    if (this.watcher === undefined) {
      this.configureWatcher();
    } else {
      this.watcher.setLoader(this.createLoader());
      this.watcher.setIntervalMs(this.activeIntervalMs());
    }

    const target: MonitorTarget = { workspaceId };
    if (floorId !== undefined) {
      target.floorId = floorId;
    }
    void this.services.context.workspaceState
      .update(MONITOR_TARGET_KEY, target)
      .then(undefined, (error: unknown) => {
        this.currentError = error;
        this.emitChange();
      });

    this.applyPolicy();
    this.emitChange();
  }

  refresh(): void {
    if (this.disposed) {
      return;
    }
    if (this.watcher !== undefined) {
      void this.watcher.refresh();
    }
    void this.refreshWorkspaces();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.generation += 1;
    this.stopWatcher();
    this.clearWorkspaceTimer();
    this.windowStateListener.dispose();
    this.configurationListener.dispose();
    this.credentialsListener.dispose();
    this.changeEmitter.dispose();
    this.attentionEmitter.dispose();
  }

  private async selectInitialWorkspace(
    client: WireClient,
    generation: number,
  ): Promise<void> {
    try {
      const [info, workspaces] = await Promise.all([client.info(), client.listWorkspaces()]);
      if (this.disposed || generation !== this.generation) {
        return;
      }

      this.currentWorkspaces = workspaces;
      this.currentError = undefined;

      const saved = readMonitorTarget(
        this.services.context.workspaceState.get<unknown>(MONITOR_TARGET_KEY),
      );
      if (
        saved !== undefined &&
        workspaces.some((workspace) => workspace.id === saved.workspaceId)
      ) {
        this.currentWorkspaceId = saved.workspaceId;
        this.currentFloorId = saved.floorId;
        return;
      }

      const editor = vscode.window.activeTextEditor;
      const folders = vscode.workspace.workspaceFolders;
      const chosen = chooseWorkspace({
        workspaces,
        filePath: editor?.document.uri.fsPath,
        folderPath: folders?.[0]?.uri.fsPath,
        rememberedWorkspaceId: this.services.memory.lastWorkspaceId(),
        activeWorkspaceId: info.activeWorkspaceId,
      });
      if (chosen !== undefined) {
        this.currentWorkspaceId = chosen.id;
        this.currentFloorId = undefined;
      }
    } catch (error) {
      if (this.disposed || generation !== this.generation) {
        return;
      }
      this.currentError = error;
    }
  }

  private configureWatcher(): void {
    const load = this.createLoader();
    if (this.watcher === undefined) {
      const watcher = new FeedWatcher({ load, intervalMs: this.activeIntervalMs() });
      this.watcherListeners = [
        watcher.onSnapshot((snapshot, previous) => {
          this.handleSnapshot(snapshot, previous);
        }),
        watcher.onError((error) => {
          this.handleError(error);
        }),
      ];
      this.watcher = watcher;
      return;
    }

    this.watcher.setLoader(load);
    this.watcher.setIntervalMs(this.activeIntervalMs());
  }

  private createLoader(): () => Promise<FeedSnapshot> {
    return () => {
      const client = this.currentClient;
      const workspaceId = this.currentWorkspaceId;
      if (client === undefined || workspaceId === undefined) {
        return Promise.reject(new Error(t('agents.monitor.notConfigured')));
      }
      return client.getFeed(workspaceId, this.currentFloorId);
    };
  }

  private handleSnapshot(snapshot: FeedSnapshot, previous: FeedSnapshot | undefined): void {
    if (this.disposed) {
      return;
    }
    this.currentSnapshot = snapshot;
    this.currentError = undefined;
    this.emitChange();

    const events = detectNewAttention(previous, snapshot);
    if (events.length > 0) {
      this.attentionEmitter.fire(events);
    }
  }

  private handleError(error: unknown): void {
    if (this.disposed) {
      return;
    }
    this.currentError = error;
    this.emitChange();
  }

  private applyPolicy(): void {
    if (this.disposed) {
      return;
    }

    const shouldRun =
      this.currentClient !== undefined &&
      this.currentWorkspaceId !== undefined &&
      vscode.window.state.focused &&
      (this.viewVisible || this.notifyAttention());

    if (this.watcher !== undefined) {
      this.watcher.setIntervalMs(this.activeIntervalMs());
      if (shouldRun) {
        if (!this.watcher.running) {
          this.watcher.start();
        }
      } else if (this.watcher.running) {
        this.watcher.stop();
      }
    }

    this.updateWorkspaceTimer();
  }

  private async refreshWorkspaces(): Promise<void> {
    const client = this.currentClient;
    if (client === undefined) {
      return;
    }

    const generation = this.generation;
    try {
      const workspaces = await client.listWorkspaces();
      if (this.disposed || generation !== this.generation) {
        return;
      }
      this.currentWorkspaces = workspaces;
      this.currentError = undefined;
      this.emitChange();
    } catch (error) {
      if (this.disposed || generation !== this.generation) {
        return;
      }
      this.currentError = error;
      this.emitChange();
    }
  }

  private updateWorkspaceTimer(): void {
    if (this.workspaceTimer !== undefined) {
      if (this.shouldRefreshWorkspaces()) {
        return;
      }
      this.clearWorkspaceTimer();
      return;
    }

    if (!this.shouldRefreshWorkspaces()) {
      return;
    }

    this.workspaceTimer = setTimeout(() => {
      this.workspaceTimer = undefined;
      void this.refreshWorkspaces().then(() => {
        this.updateWorkspaceTimer();
      });
    }, WORKSPACE_REFRESH_MS);
  }

  private shouldRefreshWorkspaces(): boolean {
    return (
      !this.disposed &&
      this.currentClient !== undefined &&
      this.viewVisible &&
      vscode.window.state.focused
    );
  }

  private clearWorkspaceTimer(): void {
    if (this.workspaceTimer !== undefined) {
      clearTimeout(this.workspaceTimer);
      this.workspaceTimer = undefined;
    }
  }

  private stopWatcher(): void {
    for (const unsubscribe of this.watcherListeners) {
      unsubscribe();
    }
    this.watcherListeners = [];
    if (this.watcher !== undefined) {
      this.watcher.stop();
      this.watcher = undefined;
    }
  }

  private notifyAttention(): boolean {
    return vscode.workspace
      .getConfiguration('maestriBridge')
      .get<boolean>('notifyAttention', true);
  }

  private pollIntervalMs(): number {
    const seconds = vscode.workspace
      .getConfiguration('maestriBridge')
      .get<number>('pollIntervalSeconds', 2);
    return (Number.isFinite(seconds) && seconds >= 1 ? seconds : 2) * 1000;
  }

  private activeIntervalMs(): number {
    return this.pollIntervalMs() * (this.viewVisible ? 1 : 3);
  }

  private reset(): void {
    this.generation += 1;
    this.stopWatcher();
    this.clearWorkspaceTimer();
    this.currentSnapshot = undefined;
    this.currentWorkspaces = [];
    this.currentWorkspaceId = undefined;
    this.currentFloorId = undefined;
    this.currentError = undefined;
    this.currentClient = undefined;
  }

  private emitChange(): void {
    if (!this.disposed) {
      this.changeEmitter.fire();
    }
  }
}

function readMonitorTarget(raw: unknown): MonitorTarget | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.workspaceId !== 'string' || record.workspaceId === '') {
    return undefined;
  }
  const target: MonitorTarget = { workspaceId: record.workspaceId };
  if (typeof record.floorId === 'string' && record.floorId !== '') {
    target.floorId = record.floorId;
  }
  return target;
}
