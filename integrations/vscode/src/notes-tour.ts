export interface StopLocation {
  file: string;
  startLine?: number;
  endLine?: number;
}

export interface TourStop<T> extends StopLocation {
  thread: T;
}

export interface NoteToursOptions {
  idleMs?: number;
  now?: () => number;
}

interface TourState<T> {
  stops: TourStop<T>[];
  lastTouch: number;
}

export class NoteTours<T> {
  private readonly idleMs: number;
  private readonly now: () => number;
  private readonly tours = new Map<string, TourState<T>>();
  private lastAgentKey: string | undefined;

  constructor(options?: NoteToursOptions) {
    this.idleMs = options?.idleMs ?? 120000;
    this.now = options?.now ?? Date.now;
  }

  begin(agentKey: string, newTour: boolean): { started: boolean; dropped: T[] } {
    const existing = this.tours.get(agentKey);
    const now = this.now();
    const active =
      existing !== undefined && !newTour && now - existing.lastTouch <= this.idleMs;

    if (active && existing !== undefined) {
      existing.lastTouch = now;
      this.lastAgentKey = agentKey;
      return { started: false, dropped: [] };
    }

    const dropped = existing === undefined ? [] : existing.stops.map((stop) => stop.thread);
    this.tours.set(agentKey, { stops: [], lastTouch: now });
    this.lastAgentKey = agentKey;
    return { started: true, dropped };
  }

  find(agentKey: string, location: StopLocation): TourStop<T> | undefined {
    return this.tours
      .get(agentKey)
      ?.stops.find(
        (stop) =>
          stop.file === location.file &&
          stop.startLine === location.startLine &&
          stop.endLine === location.endLine,
      );
  }

  push(agentKey: string, stop: TourStop<T>): void {
    const tour = this.tours.get(agentKey);
    if (tour === undefined) {
      this.tours.set(agentKey, { stops: [stop], lastTouch: this.now() });
    } else {
      tour.stops.push(stop);
      tour.lastTouch = this.now();
    }
    this.lastAgentKey = agentKey;
  }

  touch(agentKey: string): void {
    const tour = this.tours.get(agentKey);
    if (tour === undefined) {
      return;
    }
    tour.lastTouch = this.now();
    this.lastAgentKey = agentKey;
  }

  position(thread: T): { agentKey: string; index: number; total: number } | undefined {
    for (const [agentKey, tour] of this.tours) {
      const index = tour.stops.findIndex((stop) => stop.thread === thread);
      if (index !== -1) {
        return { agentKey, index, total: tour.stops.length };
      }
    }
    return undefined;
  }

  stops(agentKey: string): readonly TourStop<T>[] {
    const tour = this.tours.get(agentKey);
    return tour === undefined ? [] : [...tour.stops];
  }

  neighbor(thread: T, step: 1 | -1): TourStop<T> | undefined {
    const position = this.position(thread);
    if (position === undefined) {
      return undefined;
    }
    const tour = this.tours.get(position.agentKey);
    if (tour === undefined || tour.stops.length === 0) {
      return undefined;
    }
    const index = (position.index + step + tour.stops.length) % tour.stops.length;
    return tour.stops[index];
  }

  latestAgent(): string | undefined {
    return this.lastAgentKey;
  }

  remove(thread: T): string | undefined {
    for (const [agentKey, tour] of this.tours) {
      const index = tour.stops.findIndex((stop) => stop.thread === thread);
      if (index === -1) {
        continue;
      }
      tour.stops.splice(index, 1);
      if (tour.stops.length === 0) {
        this.tours.delete(agentKey);
        if (this.lastAgentKey === agentKey) {
          this.recomputeLatest();
        }
      }
      return agentKey;
    }
    return undefined;
  }

  clear(): T[] {
    const threads = [...this.tours.values()].flatMap((tour) =>
      tour.stops.map((stop) => stop.thread),
    );
    this.tours.clear();
    this.lastAgentKey = undefined;
    return threads;
  }

  private recomputeLatest(): void {
    let latest: string | undefined;
    let latestTouch = Number.NEGATIVE_INFINITY;
    for (const [agentKey, tour] of this.tours) {
      if (tour.lastTouch > latestTouch) {
        latest = agentKey;
        latestTouch = tour.lastTouch;
      }
    }
    this.lastAgentKey = latest;
  }
}
