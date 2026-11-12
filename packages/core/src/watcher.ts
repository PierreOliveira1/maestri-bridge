import type { FeedSnapshot } from './models.ts';

export interface FeedWatcherOptions {
  load: () => Promise<FeedSnapshot>;
  intervalMs: number;
  maxBackoffMs?: number;
}

export class FeedWatcher {
  private load: () => Promise<FeedSnapshot>;
  private intervalMs: number;
  private readonly maxBackoffMs: number;
  private currentSnapshot: FeedSnapshot | undefined;
  private isRunning = false;
  private failures = 0;
  private generation = 0;
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;
  private readonly snapshotListeners = new Set<
    (snapshot: FeedSnapshot, previous: FeedSnapshot | undefined) => void
  >();
  private readonly errorListeners = new Set<(error: unknown) => void>();

  constructor(options: FeedWatcherOptions) {
    this.load = options.load;
    this.intervalMs = options.intervalMs;
    this.maxBackoffMs = options.maxBackoffMs ?? 30000;
  }

  get current(): FeedSnapshot | undefined {
    return this.currentSnapshot;
  }

  get running(): boolean {
    return this.isRunning;
  }

  onSnapshot(
    listener: (snapshot: FeedSnapshot, previous: FeedSnapshot | undefined) => void,
  ): () => void {
    this.snapshotListeners.add(listener);
    return () => {
      this.snapshotListeners.delete(listener);
    };
  }

  onError(listener: (error: unknown) => void): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  start(): void {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    void this.refresh();
  }

  stop(): void {
    this.isRunning = false;
    this.generation += 1;
    this.inFlight = undefined;
    this.clearTimer();
  }

  setIntervalMs(ms: number): void {
    this.intervalMs = ms;
    if (this.isRunning && this.inFlight === undefined && this.failures === 0) {
      this.schedule(ms);
    }
  }

  setLoader(load: () => Promise<FeedSnapshot>): void {
    this.load = load;
    this.generation += 1;
    this.currentSnapshot = undefined;
    this.inFlight = undefined;
    this.clearTimer();
    if (this.isRunning) {
      void this.refresh();
    }
  }

  refresh(): Promise<void> {
    if (this.inFlight !== undefined) {
      return this.inFlight;
    }

    this.clearTimer();
    const generation = this.generation;
    const promise = this.performLoad(generation).finally(() => {
      if (this.inFlight === promise) {
        this.inFlight = undefined;
      }
    });
    this.inFlight = promise;
    return promise;
  }

  private async performLoad(generation: number): Promise<void> {
    let snapshot: FeedSnapshot;
    try {
      snapshot = await this.load();
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }
      this.failures += 1;
      this.emitError(error);
      if (this.isRunning) {
        this.schedule(this.backoffDelay());
      }
      return;
    }

    if (generation !== this.generation) {
      return;
    }

    this.failures = 0;
    const previous = this.currentSnapshot;
    let changed = previous === undefined;
    if (previous !== undefined) {
      try {
        changed = JSON.stringify(previous) !== JSON.stringify(snapshot);
      } catch {
        changed = true;
      }
    }

    if (changed) {
      this.currentSnapshot = snapshot;
      this.emitSnapshot(snapshot, previous);
    }

    if (this.isRunning) {
      this.schedule(this.intervalMs);
    }
  }

  private backoffDelay(): number {
    const exponent = Math.max(0, this.failures - 1);
    return Math.min(this.intervalMs * 2 ** exponent, this.maxBackoffMs);
  }

  private schedule(delay: number): void {
    this.clearTimer();
    if (!this.isRunning) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.refresh();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private emitSnapshot(snapshot: FeedSnapshot, previous: FeedSnapshot | undefined): void {
    for (const listener of [...this.snapshotListeners]) {
      try {
        listener(snapshot, previous);
      } catch {
        continue;
      }
    }
  }

  private emitError(error: unknown): void {
    for (const listener of [...this.errorListeners]) {
      try {
        listener(error);
      } catch {
        continue;
      }
    }
  }
}
