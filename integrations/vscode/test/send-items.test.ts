import { describe, expect, it } from 'vitest';
import type {
  CodeReference,
  TerminalSummary,
  WorkspaceSummary,
} from '@maestri-bridge/core';
import {
  agentLabel,
  floorLabel,
  summarizeReferences,
  terminalItemView,
  workspaceDetail,
} from '../src/send-items.ts';

function terminal(overrides: Partial<TerminalSummary> = {}): TerminalSummary {
  return {
    id: 't1',
    nodeId: 'n1',
    name: 'Agente',
    isRunning: true,
    needsAttention: false,
    isActive: false,
    isManager: false,
    preview: [],
    ...overrides,
  };
}

function workspace(overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
  return {
    id: 'w1',
    name: 'Projeto',
    isLoaded: false,
    isLocked: false,
    ...overrides,
  };
}

describe('terminalItemView', () => {
  it('prioriza os ícones na ordem definida', () => {
    expect(
      terminalItemView(terminal({ needsAttention: true, isManager: true, isRunning: false }))
        .label,
    ).toBe('$(bell-dot) Agente');
    expect(terminalItemView(terminal({ isManager: true, isRunning: false })).label).toBe(
      '$(star-full) Agente',
    );
    expect(terminalItemView(terminal({ isRunning: false })).label).toBe('$(circle-slash) Agente');
    expect(terminalItemView(terminal()).label).toBe('$(terminal) Agente');
  });

  it('junta as partes não vazias da descrição', () => {
    expect(
      terminalItemView(
        terminal({
          roleName: 'Orquestrador',
          agentType: 'claude_code',
          isRunning: false,
          needsAttention: true,
        }),
      ).description,
    ).toBe('Orquestrador · Claude Code · parado · pedindo atenção');
  });

  it('omite partes vazias da descrição', () => {
    expect(
      terminalItemView(terminal({ roleName: '', agentType: undefined })).description,
    ).toBe('');
    expect(terminalItemView(terminal({ roleName: 'Chefe', agentType: 'open_code' })).description).toBe(
      'Chefe · OpenCode',
    );
  });

  it('usa a última linha não vazia do preview', () => {
    expect(
      terminalItemView(
        terminal({
          preview: ['linha antiga', '', '   ', '  última   linha \t com  espaços  '],
        }),
      ).detail,
    ).toBe('última linha com espaços');
  });

  it('omite o detail quando não há linha', () => {
    const empty = terminalItemView(terminal({ preview: [] }));
    expect(empty.detail).toBeUndefined();
    expect('detail' in empty).toBe(false);

    const blank = terminalItemView(terminal({ preview: ['   ', ''] }));
    expect(blank.detail).toBeUndefined();
  });

  it('corta o detail em 90 caracteres com reticências', () => {
    const view = terminalItemView(terminal({ preview: ['x'.repeat(120)] }));
    expect(view.detail).toBe(`${'x'.repeat(89)}…`);
    expect(view.detail).toHaveLength(90);
  });

  it('não corta o detail com exatamente 90 caracteres', () => {
    const line = 'y'.repeat(90);
    expect(terminalItemView(terminal({ preview: [line] })).detail).toBe(line);
  });
});

describe('agentLabel', () => {
  it('mapeia os tipos conhecidos', () => {
    expect(agentLabel('claude_code')).toBe('Claude Code');
    expect(agentLabel('open_code')).toBe('OpenCode');
    expect(agentLabel('codex')).toBe('Codex');
    expect(agentLabel('gemini')).toBe('Gemini');
    expect(agentLabel('generic_shell')).toBe('Shell');
  });

  it('devolve vazio sem tipo', () => {
    expect(agentLabel(undefined)).toBe('');
  });

  it('formata tipos desconhecidos', () => {
    expect(agentLabel('foo_bar')).toBe('Foo Bar');
    expect(agentLabel('custom')).toBe('Custom');
  });
});

describe('summarizeReferences', () => {
  const references: CodeReference[] = [
    { path: 'src/a.ts', startLine: 1 },
    { path: 'src/b.ts', startLine: 3, endLine: 4, language: 'typescript' },
    { path: 'src/c.ts' },
  ];

  it('devolve vazio sem referências', () => {
    expect(summarizeReferences([])).toBe('');
  });

  it('resume uma referência', () => {
    expect(summarizeReferences(references.slice(0, 1))).toBe('src/a.ts:1');
  });

  it('resume duas referências', () => {
    expect(summarizeReferences(references.slice(0, 2))).toBe(
      'src/a.ts:1, src/b.ts:3-4 (typescript)',
    );
  });

  it('conta as referências extras', () => {
    expect(summarizeReferences(references)).toBe(
      'src/a.ts:1, src/b.ts:3-4 (typescript) +1',
    );
  });
});

describe('workspaceDetail', () => {
  it('mostra a contagem e o estado de carregado', () => {
    expect(
      workspaceDetail(workspace({ runningTerminalCount: 2, terminalCount: 3, isLoaded: true })),
    ).toBe('2 de 3 terminais rodando · carregado');
  });

  it('usa zero quando as contagens não vêm', () => {
    expect(workspaceDetail(workspace())).toBe('0 de 0 terminais rodando');
    expect(workspaceDetail(workspace({ runningTerminalCount: 0, terminalCount: 1 }))).toBe(
      '0 de 1 terminais rodando',
    );
  });
});

describe('floorLabel', () => {
  it('chama o andar sem id de Térreo', () => {
    expect(floorLabel({ name: 'Térreo', isActive: false })).toBe('Térreo');
  });

  it('usa o nome dos demais andares', () => {
    expect(floorLabel({ id: 'f2', name: 'Andar 2', isActive: true })).toBe('Andar 2');
  });
});
