import { describe, expect, it } from 'vitest';
import { currentFloorKey, floorKey, groupTerminalsByFloor } from '../src/floors.ts';
import type { FeedSnapshot, FloorSummary, TerminalSummary } from '../src/models.ts';

function terminal(id: string, floorId?: string): TerminalSummary {
  const value: TerminalSummary = {
    id,
    nodeId: `node-${id}`,
    name: id,
    isRunning: true,
    needsAttention: false,
    isActive: false,
    isManager: false,
    preview: [],
  };
  if (floorId !== undefined) {
    value.floorId = floorId;
  }
  return value;
}

function snapshot(floors: FloorSummary[], terminals: TerminalSummary[]): FeedSnapshot {
  return {
    workspace: { id: 'w1', name: 'Onboard', isLoaded: true, isLocked: false },
    floors,
    terminals,
    pendingPrompts: [],
  };
}

const ground: FloorSummary = { name: 'Ground', isActive: false };
const flcnA: FloorSummary = { id: 'A', name: 'FLCN 2455', isActive: true };
const flcnB: FloorSummary = { id: 'B', name: 'FLCN 2715', isActive: false };
const flcnC: FloorSummary = { id: 'C', name: 'FLCN 2531', isActive: false };

describe('floorKey', () => {
  it('usa ground para o térreo', () => {
    expect(floorKey(undefined)).toBe('ground');
    expect(floorKey('')).toBe('ground');
    expect(floorKey('A')).toBe('A');
  });
});

describe('currentFloorKey', () => {
  const feed = snapshot([ground, flcnA, flcnB], []);

  it('prefere o andar escolhido quando ele existe', () => {
    expect(currentFloorKey(feed, 'B')).toBe('B');
    expect(currentFloorKey(feed, 'ground')).toBe('ground');
  });

  it('cai no andar ativo quando o escolhido não existe', () => {
    expect(currentFloorKey(feed, 'sumiu')).toBe('A');
    expect(currentFloorKey(feed)).toBe('A');
  });

  it('usa o primeiro andar quando nenhum está ativo', () => {
    expect(currentFloorKey(snapshot([ground, flcnB], []))).toBe('ground');
  });

  it('devolve undefined sem andares', () => {
    expect(currentFloorKey(snapshot([], []))).toBeUndefined();
  });
});

describe('groupTerminalsByFloor', () => {
  const feed = snapshot(
    [ground, flcnA, flcnB, flcnC],
    [terminal('a1', 'A'), terminal('b1', 'B'), terminal('g1'), terminal('a2', 'A'), terminal('b2', 'B')],
  );

  it('põe o andar atual primeiro e mantém a ordem dos outros', () => {
    const groups = groupTerminalsByFloor(feed);
    expect(groups.map((group) => [group.key, group.isCurrent])).toEqual([
      ['A', true],
      ['ground', false],
      ['B', false],
    ]);
    expect(groups[0]?.terminals.map((item) => item.id)).toEqual(['a1', 'a2']);
    expect(groups[1]?.terminals.map((item) => item.id)).toEqual(['g1']);
    expect(groups[2]?.terminals.map((item) => item.id)).toEqual(['b1', 'b2']);
  });

  it('respeita o andar escolhido', () => {
    const groups = groupTerminalsByFloor(feed, 'B');
    expect(groups.map((group) => group.key)).toEqual(['B', 'ground', 'A']);
  });

  it('esconde andares vazios, menos o atual', () => {
    const groups = groupTerminalsByFloor(feed, 'C');
    expect(groups.map((group) => [group.key, group.terminals.length])).toEqual([
      ['C', 0],
      ['ground', 1],
      ['A', 2],
      ['B', 2],
    ]);
  });

  it('junta ao andar atual os terminais de andar desconhecido', () => {
    const groups = groupTerminalsByFloor(snapshot([flcnA], [terminal('x', 'Z'), terminal('a1', 'A')]));
    expect(groups).toHaveLength(1);
    expect(groups[0]?.terminals.map((item) => item.id)).toEqual(['a1', 'x']);
  });

  it('cria um térreo quando o feed não traz andares', () => {
    const groups = groupTerminalsByFloor(snapshot([], [terminal('t1')]));
    expect(groups).toEqual([
      expect.objectContaining({ key: 'ground', isCurrent: true, terminals: [expect.objectContaining({ id: 't1' })] }),
    ]);
    expect(groups[0]?.floor).toEqual({ name: 'Ground', isActive: true });
  });

  it('devolve lista vazia sem andares nem terminais', () => {
    expect(groupTerminalsByFloor(snapshot([], []))).toEqual([]);
  });
});
