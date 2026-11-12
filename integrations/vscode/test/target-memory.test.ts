import { describe, expect, it } from 'vitest';
import { TargetMemory } from '../src/target-memory.ts';
import type { AgentTarget, MementoLike } from '../src/target-memory.ts';

class FakeMemento implements MementoLike {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

const target: AgentTarget = {
  workspaceId: 'w1',
  workspaceName: 'Projeto',
  floorId: 'f2',
  floorName: 'FLCN 2455',
  terminalId: 't1',
  terminalName: 'Agente',
};

describe('TargetMemory', () => {
  it('lê um lastTarget válido', () => {
    const memento = new FakeMemento();
    void memento.update('maestriBridge.lastTarget', target);

    expect(new TargetMemory(memento).lastTarget()).toEqual(target);
  });

  it('ignora floorId inválido no lastTarget', () => {
    const memento = new FakeMemento();
    void memento.update('maestriBridge.lastTarget', {
      ...target,
      floorId: 42,
      floorName: '',
      extra: 'ignorado',
    });

    expect(new TargetMemory(memento).lastTarget()).toEqual({
      workspaceId: 'w1',
      workspaceName: 'Projeto',
      terminalId: 't1',
      terminalName: 'Agente',
    });
  });

  it('devolve undefined para lastTarget inválido', () => {
    const memento = new FakeMemento();
    const memory = new TargetMemory(memento);

    expect(memory.lastTarget()).toBeUndefined();

    void memento.update('maestriBridge.lastTarget', { ...target, terminalId: '' });
    expect(memory.lastTarget()).toBeUndefined();

    void memento.update('maestriBridge.lastTarget', { ...target, workspaceName: undefined });
    expect(memory.lastTarget()).toBeUndefined();

    void memento.update('maestriBridge.lastTarget', 'texto');
    expect(memory.lastTarget()).toBeUndefined();
  });

  it('lê o último workspace', () => {
    const memento = new FakeMemento();
    const memory = new TargetMemory(memento);

    expect(memory.lastWorkspaceId()).toBeUndefined();

    void memento.update('maestriBridge.lastWorkspaceId', 'w1');
    expect(memory.lastWorkspaceId()).toBe('w1');

    void memento.update('maestriBridge.lastWorkspaceId', '');
    expect(memory.lastWorkspaceId()).toBeUndefined();
  });

  it('lê o último terminal por workspace', () => {
    const memento = new FakeMemento();
    void memento.update('maestriBridge.lastTerminals', { w1: 't1', w2: 't2' });
    const memory = new TargetMemory(memento);

    expect(memory.lastTerminalId('w1')).toBe('t1');
    expect(memory.lastTerminalId('w2')).toBe('t2');
    expect(memory.lastTerminalId('w3')).toBeUndefined();
  });

  it('grava as três chaves e mescla o mapa de terminais', async () => {
    const memento = new FakeMemento();
    void memento.update('maestriBridge.lastTerminals', { w2: 't2' });
    const memory = new TargetMemory(memento);

    await memory.remember(target);

    expect(memento.get<unknown>('maestriBridge.lastTarget')).toEqual(target);
    expect(memento.get<unknown>('maestriBridge.lastWorkspaceId')).toBe('w1');
    expect(memento.get<unknown>('maestriBridge.lastTerminals')).toEqual({
      w2: 't2',
      w1: 't1',
    });
  });
});
