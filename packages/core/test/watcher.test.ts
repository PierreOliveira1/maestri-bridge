import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedSnapshot } from '../src/models.ts';
import { FeedWatcher } from '../src/watcher.ts';

function snapshot(id: string): FeedSnapshot {
  return {
    workspace: { id, name: id, isLoaded: true, isLocked: false },
    floors: [],
    terminals: [],
    pendingPrompts: [],
  };
}

interface Deferred {
  promise: Promise<FeedSnapshot>;
  resolve(value: FeedSnapshot): void;
  reject(error: unknown): void;
}

function deferred(): Deferred {
  let resolve: Deferred['resolve'] = () => undefined;
  let reject: Deferred['reject'] = () => undefined;
  const promise = new Promise<FeedSnapshot>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FeedWatcher', () => {
  it('start carrega na hora, é idempotente e agenda pelo intervalo', async () => {
    const load = vi.fn(async () => snapshot('ws'));
    const watcher = new FeedWatcher({ load, intervalMs: 1000 });

    watcher.start();
    watcher.start();
    expect(load).toHaveBeenCalledTimes(1);
    expect(watcher.running).toBe(true);

    await vi.advanceTimersByTimeAsync(0);
    expect(watcher.current?.workspace.id).toBe('ws');

    await vi.advanceTimersByTimeAsync(999);
    expect(load).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('não emite quando o snapshot não mudou', async () => {
    const load = vi.fn(async () => snapshot('ws'));
    const watcher = new FeedWatcher({ load, intervalMs: 1000 });
    const listener = vi.fn();
    watcher.onSnapshot(listener);

    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(listener).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('emite com o previous correto', async () => {
    const first = snapshot('ws-1');
    const second = snapshot('ws-2');
    let value = first;
    const load = vi.fn(async () => value);
    const watcher = new FeedWatcher({ load, intervalMs: 1000 });
    const listener = vi.fn();
    watcher.onSnapshot(listener);

    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    value = second;
    await vi.advanceTimersByTimeAsync(1000);

    expect(listener).toHaveBeenNthCalledWith(1, first, undefined);
    expect(listener).toHaveBeenNthCalledWith(2, second, first);
  });

  it('faz backoff exponencial com teto e reseta no sucesso', async () => {
    let failing = true;
    const load = vi.fn(async () => {
      if (failing) {
        throw new Error('falha');
      }
      return snapshot('ws');
    });
    const watcher = new FeedWatcher({ load, intervalMs: 1000, maxBackoffMs: 3000 });
    const errors = vi.fn();
    watcher.onError(errors);

    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1999);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(2999);
    expect(load).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toHaveBeenCalledTimes(4);

    failing = false;
    await vi.advanceTimersByTimeAsync(3000);
    expect(load).toHaveBeenCalledTimes(5);
    expect(watcher.current?.workspace.id).toBe('ws');

    await vi.advanceTimersByTimeAsync(999);
    expect(load).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(6);

    failing = true;
    await vi.advanceTimersByTimeAsync(999);
    expect(load).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(7);
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(999);
    expect(load).toHaveBeenCalledTimes(7);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(8);
  });

  it('stop descarta resultado em voo', async () => {
    const pending = deferred();
    const load = vi.fn(() => pending.promise);
    const watcher = new FeedWatcher({ load, intervalMs: 1000 });
    const listener = vi.fn();
    watcher.onSnapshot(listener);

    watcher.start();
    expect(load).toHaveBeenCalledTimes(1);

    watcher.stop();
    expect(watcher.running).toBe(false);
    pending.resolve(snapshot('ws'));
    await vi.advanceTimersByTimeAsync(0);

    expect(watcher.current).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10000);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('refresh concorrente reaproveita a mesma carga', async () => {
    const pending = deferred();
    const load = vi.fn(() => pending.promise);
    const watcher = new FeedWatcher({ load, intervalMs: 1000 });

    const first = watcher.refresh();
    const second = watcher.refresh();
    expect(second).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);

    pending.resolve(snapshot('ws'));
    await first;
    expect(watcher.current?.workspace.id).toBe('ws');
  });

  it('setLoader zera o current e descarta o loader antigo', async () => {
    const initial = snapshot('ws-1');
    const loadInitial = vi.fn(async () => initial);
    const watcher = new FeedWatcher({ load: loadInitial, intervalMs: 1000 });
    const listener = vi.fn();
    watcher.onSnapshot(listener);

    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(watcher.current).toBe(initial);
    expect(listener).toHaveBeenCalledTimes(1);

    const oldLoad = deferred();
    const newLoad = deferred();
    const loadOld = vi.fn(() => oldLoad.promise);
    const loadNew = vi.fn(() => newLoad.promise);

    watcher.setLoader(loadOld);
    expect(watcher.current).toBeUndefined();
    expect(loadOld).toHaveBeenCalledTimes(1);

    watcher.setLoader(loadNew);
    expect(loadNew).toHaveBeenCalledTimes(1);

    oldLoad.resolve(snapshot('ws-old'));
    await vi.advanceTimersByTimeAsync(0);
    expect(watcher.current).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);

    const newest = snapshot('ws-new');
    newLoad.resolve(newest);
    await vi.advanceTimersByTimeAsync(0);
    expect(watcher.current).toBe(newest);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(2, newest, undefined);
  });

  it('listener que lança não quebra o ciclo', async () => {
    const load = vi.fn(async () => snapshot('ws'));
    const watcher = new FeedWatcher({ load, intervalMs: 1000 });
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    watcher.onSnapshot(bad);
    watcher.onSnapshot(good);

    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('listener de erro que lança não quebra o ciclo', async () => {
    let failing = true;
    const load = vi.fn(async () => {
      if (failing) {
        throw new Error('falha');
      }
      return snapshot('ws');
    });
    const watcher = new FeedWatcher({ load, intervalMs: 1000 });
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    watcher.onError(bad);
    watcher.onError(good);

    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(good).toHaveBeenCalledTimes(1);

    failing = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(2);
    expect(watcher.current?.workspace.id).toBe('ws');
  });

  it('setIntervalMs reagenda a partir de agora quando está ocioso', async () => {
    const load = vi.fn(async () => snapshot('ws'));
    const watcher = new FeedWatcher({ load, intervalMs: 1000 });

    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(400);

    watcher.setIntervalMs(5000);
    await vi.advanceTimersByTimeAsync(4999);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('setIntervalMs não interrompe o backoff em erro', async () => {
    let failing = true;
    const load = vi.fn(async () => {
      if (failing) {
        throw new Error('falha');
      }
      return snapshot('ws');
    });
    const watcher = new FeedWatcher({ load, intervalMs: 1000 });

    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(500);

    watcher.setIntervalMs(10000);
    await vi.advanceTimersByTimeAsync(499);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('remove listeners', async () => {
    const load = vi.fn(async () => snapshot('ws'));
    const watcher = new FeedWatcher({ load, intervalMs: 1000 });
    const listener = vi.fn();
    const remove = watcher.onSnapshot(listener);
    remove();

    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(listener).not.toHaveBeenCalled();
  });
});
