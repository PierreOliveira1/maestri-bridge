import { describe, expect, it } from 'vitest';
import type { TerminalSummary, WorkspaceSummary } from '../src/models.ts';
import { matchWorkspaceByPath, rankTerminals } from '../src/selection.ts';

function workspace(id: string, workingDirectory?: string): WorkspaceSummary {
  const summary: WorkspaceSummary = { id, name: id, isLoaded: true, isLocked: false };
  if (workingDirectory !== undefined) {
    summary.workingDirectory = workingDirectory;
  }
  return summary;
}

function terminal(id: string, overrides: Partial<TerminalSummary> = {}): TerminalSummary {
  return {
    id,
    nodeId: id,
    name: id,
    isRunning: false,
    needsAttention: false,
    isActive: false,
    isManager: false,
    preview: [],
    ...overrides,
  };
}

describe('matchWorkspaceByPath', () => {
  it('casa arquivo dentro do diretório do workspace', () => {
    const target = workspace('target', '/Users/dev/Proj');
    expect(matchWorkspaceByPath([target], '/Users/dev/Proj/src/main.ts')).toBe(target);
  });

  it('casa o próprio caminho do workspace', () => {
    const target = workspace('target', '/Users/dev/Proj');
    expect(matchWorkspaceByPath([target], '/Users/dev/Proj')).toBe(target);
  });

  it('respeita a fronteira de diretório', () => {
    const target = workspace('target', '/Users/dev/proj');
    expect(matchWorkspaceByPath([target], '/Users/dev/project/main.ts')).toBeUndefined();
  });

  it('ignora barra final no workingDirectory', () => {
    const target = workspace('target', '/Users/dev/Proj/');
    expect(matchWorkspaceByPath([target], '/Users/dev/Proj/src/main.ts')).toBe(target);
  });

  it('escolhe o workingDirectory mais longo', () => {
    const parent = workspace('parent', '/Users/dev');
    const child = workspace('child', '/Users/dev/Proj');
    expect(matchWorkspaceByPath([parent, child], '/Users/dev/Proj/src/main.ts')).toBe(child);
  });

  it('devolve undefined quando nenhum workspace casa', () => {
    expect(matchWorkspaceByPath([workspace('a', '/Users/a')], '/Users/b/main.ts')).toBeUndefined();
  });

  it('ignora workspace sem workingDirectory', () => {
    expect(matchWorkspaceByPath([workspace('sem')], '/Users/dev/main.ts')).toBeUndefined();
  });
});

describe('rankTerminals', () => {
  it('coloca o preferredId primeiro', () => {
    const running = terminal('running', {
      isRunning: true,
      needsAttention: true,
      lastActiveAt: '2026-11-12T10:00:00Z',
    });
    const preferred = terminal('preferred');

    expect(rankTerminals([running, preferred], 'preferred').map((item) => item.id)).toEqual([
      'preferred',
      'running',
    ]);
  });

  it('prioriza terminais rodando', () => {
    const stopped = terminal('stopped', {
      needsAttention: true,
      lastActiveAt: '2026-11-12T10:00:00Z',
    });
    const running = terminal('running', { isRunning: true });

    expect(rankTerminals([stopped, running]).map((item) => item.id)).toEqual([
      'running',
      'stopped',
    ]);
  });

  it('prioriza terminais que precisam de atenção', () => {
    const calm = terminal('calm', {
      isRunning: true,
      lastActiveAt: '2026-11-12T10:00:00Z',
    });
    const alert = terminal('alert', {
      isRunning: true,
      needsAttention: true,
      lastActiveAt: '2026-11-01T00:00:00Z',
    });

    expect(rankTerminals([calm, alert]).map((item) => item.id)).toEqual(['alert', 'calm']);
  });

  it('ordena por lastActiveAt, com ausente por último', () => {
    const older = terminal('older', {
      isRunning: true,
      lastActiveAt: '2026-11-01T00:00:00Z',
    });
    const newer = terminal('newer', {
      isRunning: true,
      lastActiveAt: '2026-11-12T00:00:00Z',
    });
    const absent = terminal('absent', { isRunning: true });

    expect(rankTerminals([older, absent, newer]).map((item) => item.id)).toEqual([
      'newer',
      'older',
      'absent',
    ]);
  });

  it('desempata pelo nome em pt-BR', () => {
    const alvaro = terminal('a', { name: 'Álvaro' });
    const bia = terminal('b', { name: 'Bia' });

    expect(rankTerminals([bia, alvaro]).map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('não muta a entrada', () => {
    const bia = terminal('b', { name: 'Bia' });
    const ana = terminal('a', { name: 'Ana' });
    const input = [bia, ana];
    const snapshot = [...input];

    const ranked = rankTerminals(input);

    expect(ranked).not.toBe(input);
    expect(ranked.map((item) => item.id)).toEqual(['a', 'b']);
    expect(input).toEqual(snapshot);
    expect(input[0]).toBe(bia);
    expect(input[1]).toBe(ana);
  });
});
