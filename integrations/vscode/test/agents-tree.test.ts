import { describe, expect, it } from 'vitest';
import type { FeedSnapshot, TerminalSummary, WorkspaceSummary } from '@maestri-bridge/core';
import {
  agentContextValue,
  agentDescription,
  agentStatus,
  attentionTooltip,
  detailLines,
  floorGroupSummary,
  orderAgents,
  otherWorkspaces,
  statusIcon,
  statusLabel,
  terminalFloor,
  workspaceSummary,
} from '../src/agents-tree.ts';

function workspace(id: string, overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
  return { id, name: id, isLoaded: true, isLocked: false, ...overrides };
}

function terminal(id: string, overrides: Partial<TerminalSummary> = {}): TerminalSummary {
  return {
    id,
    nodeId: id,
    name: id,
    isRunning: true,
    needsAttention: false,
    isActive: false,
    isManager: false,
    preview: [],
    ...overrides,
  };
}

function snapshot(overrides: Partial<FeedSnapshot> = {}): FeedSnapshot {
  return {
    workspace: workspace('ws'),
    floors: [],
    terminals: [],
    pendingPrompts: [],
    ...overrides,
  };
}

describe('agentStatus', () => {
  it('prioriza atenção, parado, trabalhando e ocioso', () => {
    expect(
      agentStatus(snapshot(), terminal('t', { needsAttention: true, isRunning: false })),
    ).toBe('attention');
    expect(agentStatus(snapshot(), terminal('t', { isRunning: false }))).toBe('stopped');
    expect(agentStatus(snapshot(), terminal('t', { isActive: true }))).toBe('working');
    expect(agentStatus(snapshot(), terminal('t'))).toBe('idle');
  });

  it('considera prompt pendente como atenção', () => {
    const feed = snapshot({
      pendingPrompts: [{ terminalId: 't', prompt: 'Permitir?' }],
    });
    expect(agentStatus(feed, terminal('t', { isRunning: false }))).toBe('attention');
  });
});

describe('statusLabel', () => {
  it('traduz cada status', () => {
    expect(statusLabel('attention')).toBe('pedindo atenção');
    expect(statusLabel('working')).toBe('trabalhando');
    expect(statusLabel('idle')).toBe('ocioso');
    expect(statusLabel('stopped')).toBe('parado');
  });
});

describe('statusIcon', () => {
  it('devolve ícone e cor de cada status', () => {
    expect(statusIcon('attention', false)).toEqual({
      id: 'bell-dot',
      color: 'charts.orange',
    });
    expect(statusIcon('working', false)).toEqual({
      id: 'sync~spin',
      color: 'charts.blue',
    });
    expect(statusIcon('working', true)).toEqual({
      id: 'sync~spin',
      color: 'charts.blue',
    });
    expect(statusIcon('stopped', false)).toEqual({
      id: 'circle-outline',
      color: 'disabledForeground',
    });
    expect(statusIcon('idle', true)).toEqual({
      id: 'star-full',
      color: 'charts.green',
    });
    expect(statusIcon('idle', false)).toEqual({
      id: 'circle-filled',
      color: 'charts.green',
    });
  });
});

describe('orderAgents', () => {
  it('coloca atenção primeiro e mantém o rank dentro dos grupos', () => {
    const attention = terminal('b', { needsAttention: true });
    const pending = terminal('c', { isRunning: false });
    const working = terminal('a', { isActive: true });
    const stopped = terminal('d', { isRunning: false });
    const feed = snapshot({
      terminals: [working, stopped, attention, pending],
      pendingPrompts: [{ terminalId: 'c', prompt: 'S/n' }],
    });

    expect(orderAgents(feed).map((item) => item.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(feed.terminals.map((item) => item.id)).toEqual(['a', 'd', 'b', 'c']);
  });
});

describe('agentDescription', () => {
  it('junta papel, tipo de agente e status sem vazios', () => {
    expect(
      agentDescription(
        snapshot(),
        terminal('t', { roleName: 'AGENTE', agentType: 'open_code' }),
      ),
    ).toBe('AGENTE · OpenCode · ocioso');

    expect(agentDescription(snapshot(), terminal('t', { agentType: 'generic_shell' }))).toBe(
      'Shell · ocioso',
    );

    expect(
      agentDescription(snapshot(), terminal('t', { roleName: '', agentType: undefined })),
    ).toBe('ocioso');
  });
});

describe('agentContextValue', () => {
  it('distingue agente normal, com atenção e com prompt pendente', () => {
    const feed = snapshot({
      pendingPrompts: [{ terminalId: 't', prompt: 'S/n' }],
    });

    expect(agentContextValue(feed, terminal('t'))).toBe('agent.attention.pending');
    expect(
      agentContextValue(snapshot(), terminal('t', { needsAttention: true })),
    ).toBe('agent.attention');
    expect(agentContextValue(snapshot(), terminal('t'))).toBe('agent');
  });
});

describe('detailLines', () => {
  it('usa o prompt pendente e as últimas linhas do preview', () => {
    const feed = snapshot({
      pendingPrompts: [{ terminalId: 't', prompt: 'Permitir?' }],
    });
    const item = terminal('t', {
      maestroRequest: { message: 'Maestro' },
      preview: ['linha 1', '', '  linha   2  ', 'linha 3', 'linha 4'],
    });

    expect(detailLines(feed, item)).toEqual([
      { kind: 'prompt', text: 'Permitir?' },
      { kind: 'preview', text: 'linha 2' },
      { kind: 'preview', text: 'linha 3' },
      { kind: 'preview', text: 'linha 4' },
    ]);
  });

  it('usa a mensagem do maestro quando não há prompt pendente', () => {
    const item = terminal('t', { maestroRequest: { message: 'Preciso de você' } });

    expect(detailLines(snapshot(), item)).toEqual([
      { kind: 'prompt', text: 'Preciso de você' },
    ]);
  });

  it('corta linhas longas em 120 caracteres com reticências', () => {
    const item = terminal('t', { preview: ['x'.repeat(130)] });

    expect(detailLines(snapshot(), item)[0]?.text).toBe(`${'x'.repeat(120)}…`);
  });

  it('respeita o máximo de linhas de preview', () => {
    const item = terminal('t', { preview: ['a', 'b', 'c'] });

    expect(detailLines(snapshot(), item, 1)).toEqual([{ kind: 'preview', text: 'c' }]);
    expect(detailLines(snapshot(), item, 0)).toEqual([]);
  });
});

describe('otherWorkspaces', () => {
  const a = workspace('a', { attentionCount: 2, runningTerminalCount: 1 });
  const b = workspace('b', { attentionCount: 2, runningTerminalCount: 5 });
  const c = workspace('c', { attentionCount: 0, runningTerminalCount: 9 });
  const d = workspace('d', { attentionCount: 2, runningTerminalCount: 5 });

  it('exclui o workspace atual e ordena por atenção e terminais rodando', () => {
    expect(otherWorkspaces([a, b, c, d], 'a').map((item) => item.id)).toEqual([
      'b',
      'd',
      'c',
    ]);
  });

  it('inclui todos quando não há workspace atual', () => {
    expect(otherWorkspaces([a, b, c, d], undefined).map((item) => item.id)).toEqual([
      'b',
      'd',
      'a',
      'c',
    ]);
  });

  it('não muta a entrada', () => {
    const input = [a, b, c, d];
    otherWorkspaces(input, 'a');
    expect(input.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('workspaceSummary', () => {
  it('descreve carregamento, terminais rodando e atenção', () => {
    expect(
      workspaceSummary(workspace('w', { isLoaded: false, runningTerminalCount: 0 })),
    ).toBe('dormindo');
    expect(
      workspaceSummary(workspace('w', { isLoaded: true, runningTerminalCount: 0 })),
    ).toBe('0 rodando');
    expect(
      workspaceSummary(workspace('w', { isLoaded: true, runningTerminalCount: 3 })),
    ).toBe('3 rodando');
    expect(
      workspaceSummary(
        workspace('w', { isLoaded: true, runningTerminalCount: 3, attentionCount: 2 }),
      ),
    ).toBe('3 rodando · 2 pedindo atenção');
    expect(
      workspaceSummary(
        workspace('w', { isLoaded: false, runningTerminalCount: 2, attentionCount: 1 }),
      ),
    ).toBe('2 rodando · 1 pedindo atenção');
    expect(
      workspaceSummary(workspace('w', { isLoaded: false, attentionCount: 1 })),
    ).toBe('dormindo · 1 pedindo atenção');
  });
});

describe('attentionTooltip', () => {
  it('usa singular e plural', () => {
    expect(attentionTooltip(1)).toBe('1 agente pedindo atenção');
    expect(attentionTooltip(2)).toBe('2 agentes pedindo atenção');
    expect(attentionTooltip(0)).toBe('0 agentes pedindo atenção');
  });
});

describe('orderAgents com lista própria', () => {
  it('ordena só os terminais recebidos', () => {
    const feed = snapshot({
      terminals: [terminal('a'), terminal('b', { needsAttention: true }), terminal('c')],
    });
    const subset = feed.terminals.filter((item) => item.id !== 'c');
    expect(orderAgents(feed, subset).map((item) => item.id)).toEqual(['b', 'a']);
  });
});

describe('terminalFloor', () => {
  const floors = [
    { name: 'Ground', isActive: false },
    { id: 'F1', name: 'FLCN 2455', isActive: true },
  ];

  it('devolve id e nome do andar quando há mais de um', () => {
    const feed = snapshot({ floors });
    expect(terminalFloor(feed, terminal('a', { floorId: 'F1' }))).toEqual({
      floorId: 'F1',
      floorName: 'FLCN 2455',
    });
    expect(terminalFloor(feed, terminal('g'))).toEqual({ floorId: 'ground', floorName: 'Térreo' });
  });

  it('não informa andar quando o workspace tem um só', () => {
    const feed = snapshot({ floors: [{ name: 'Ground', isActive: true }] });
    expect(terminalFloor(feed, terminal('a'))).toBeUndefined();
  });

  it('não informa andar desconhecido', () => {
    const feed = snapshot({ floors });
    expect(terminalFloor(feed, terminal('a', { floorId: 'sumiu' }))).toBeUndefined();
  });
});

describe('floorGroupSummary', () => {
  it('conta agentes e pedidos de atenção', () => {
    const feed = snapshot({});
    expect(floorGroupSummary(feed, [terminal('a')])).toBe('1 agente');
    expect(
      floorGroupSummary(feed, [terminal('a'), terminal('b', { needsAttention: true })]),
    ).toBe('2 agentes · 1 pedindo atenção');
  });
});
