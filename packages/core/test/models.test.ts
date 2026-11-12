import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WireError } from '../src/errors.ts';
import { parseFeed, parseHostInfo, parseWorkspaces } from '../src/models.ts';

const sample = JSON.parse(
  readFileSync(new URL('./fixtures/wire-sample.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

function captureWireError(run: () => unknown): WireError {
  try {
    run();
  } catch (error) {
    if (error instanceof WireError) {
      return error;
    }
    throw error;
  }
  throw new Error('Esperava um WireError.');
}

describe('parseHostInfo', () => {
  it('lê o info do fixture', () => {
    const info = parseHostInfo(sample.info);
    expect(info.name).toBe('Studio');
    expect(info.protocolVersion).toBe(1);
    expect(info.role).toBe('owner');
    expect(info.requiresPassword).toBe(false);
    expect(info.activeWorkspaceId).toBe('E4AF8924-240D-4EC7-8C49-C1B611451BF5');
    expect(info.capabilities).toContain('feedSnapshots');
    expect(info.hosts).toEqual(['192.168.1.20']);
  });

  it('omite opcionais nulos ou com tipo errado', () => {
    const info = parseHostInfo({
      name: 'X',
      protocolVersion: 1,
      capabilities: ['a', 2, null],
      requiresPassword: null,
      activeWorkspaceId: null,
      role: null,
      hosts: null,
    });
    expect(info).toEqual({ name: 'X', protocolVersion: 1, capabilities: ['a'] });
  });

  it('exige name, protocolVersion e capabilities', () => {
    const noName = captureWireError(() =>
      parseHostInfo({ protocolVersion: 1, capabilities: [] }),
    );
    expect(noName.code).toBe('unknown');
    expect(noName.message).toBe('Invalid response from Maestri.');

    const noCapabilities = captureWireError(() =>
      parseHostInfo({ name: 'X', protocolVersion: 1, capabilities: 'nada' }),
    );
    expect(noCapabilities.code).toBe('unknown');
  });
});

describe('parseWorkspaces', () => {
  it('lê os workspaces do fixture', () => {
    const workspaces = parseWorkspaces(sample.workspaces);
    expect(workspaces).toHaveLength(6);
    expect(workspaces[0]?.name).toBe('PC');
    expect(workspaces[0]?.isLocked).toBe(true);
    expect(workspaces[0]?.workingDirectory).toBe('/Users/dev/Projects');
    expect(workspaces[0]?.terminalCount).toBe(2);
    expect(workspaces[3]?.activeFloorId).toBeUndefined();
  });

  it('descarta itens sem id ou name e aplica defaults', () => {
    const workspaces = parseWorkspaces({
      workspaces: [
        {
          id: 'w1',
          name: 'W1',
          isLoaded: null,
          isLocked: null,
          activeFloorId: null,
          workingDirectory: null,
          terminalCount: null,
          runningTerminalCount: null,
          attentionCount: null,
        },
        { id: 'w2', name: 'W2', isLoaded: true, isLocked: true, terminalCount: 3 },
        { id: 'w3' },
        { name: 'sem id' },
        null,
      ],
    });

    expect(workspaces.map((workspace) => workspace.id)).toEqual(['w1', 'w2']);
    expect(workspaces[0]).toEqual({ id: 'w1', name: 'W1', isLoaded: false, isLocked: false });
    expect(workspaces[1]?.terminalCount).toBe(3);
  });

  it('exige o array workspaces', () => {
    const error = captureWireError(() => parseWorkspaces({}));
    expect(error.code).toBe('unknown');
    expect(error.message).toBe('Invalid response from Maestri.');
  });
});

describe('parseFeed', () => {
  it('lê o feed do fixture', () => {
    const feed = parseFeed(sample.feed);
    expect(feed.workspace.name).toBe('Maestri Extension');
    expect(feed.workspace.isLoaded).toBe(true);
    expect(feed.terminals.map((terminal) => terminal.name)).toEqual([
      'Trilha',
      'Forja',
      'Shell',
      'Head',
    ]);

    const head = feed.terminals.find((terminal) => terminal.name === 'Head');
    expect(head?.isManager).toBe(true);
    expect(head?.floorId).toBeUndefined();
    expect(head?.roleName).toBe('ORQUESTRADOR');

    expect(feed.floors).toHaveLength(1);
    expect(feed.floors[0]?.id).toBeUndefined();
    expect(feed.floors[0]?.name).toBe('Ground');
    expect(feed.floors[0]?.isActive).toBe(true);
    expect(feed.epoch).toBe('B2B4FAB1-31AA-4C92-AB7C-A702C1056005');
    expect(feed.pendingPrompts).toEqual([]);
  });

  it('acrescenta pendingPrompts e não duplica terminais', () => {
    const feed = parseFeed({
      workspace: { id: 'ws', name: 'Workspace' },
      items: [
        { kind: 'terminal', terminal: { id: 't1', nodeId: 'n1', name: 'T1' } },
        {
          kind: 'pendingPrompt',
          prompt: 'Permitir?',
          terminal: { id: 't1', nodeId: 'n1', name: 'T1' },
        },
        {
          kind: 'pendingPrompt',
          prompt: 'Continuar?',
          terminal: { id: 't2', nodeId: 'n2', name: 'T2' },
        },
      ],
    });

    expect(feed.terminals.map((terminal) => terminal.id)).toEqual(['t1', 't2']);
    expect(feed.pendingPrompts).toEqual([
      { terminalId: 't1', prompt: 'Permitir?' },
      { terminalId: 't2', prompt: 'Continuar?' },
    ]);
  });

  it('ignora pendingPrompts inválidos', () => {
    const feed = parseFeed({
      workspace: { id: 'ws', name: 'Workspace' },
      items: [
        {
          kind: 'pendingPrompt',
          prompt: 'Sem terminal válido',
          terminal: { id: 'sem-node', name: 'X' },
        },
        {
          kind: 'pendingPrompt',
          prompt: 42,
          terminal: { id: 't1', nodeId: 'n1', name: 'T1' },
        },
        { kind: 'pendingPrompt', prompt: 'Sem objeto', terminal: 'nada' },
      ],
    });

    expect(feed.pendingPrompts).toEqual([]);
    expect(feed.terminals).toEqual([]);
  });

  it('lê maestroRequest válido e ignora inválido', () => {
    const feed = parseFeed({
      workspace: { id: 'ws', name: 'Workspace' },
      items: [
        {
          kind: 'terminal',
          terminal: {
            id: 't1',
            nodeId: 'n1',
            name: 'T1',
            maestroRequest: {
              message: 'Preciso de você',
              createdAt: '2026-11-12T10:00:00Z',
            },
          },
        },
        {
          kind: 'terminal',
          terminal: { id: 't2', nodeId: 'n2', name: 'T2', maestroRequest: { message: '   ' } },
        },
        {
          kind: 'terminal',
          terminal: { id: 't3', nodeId: 'n3', name: 'T3', maestroRequest: { message: 42 } },
        },
        {
          kind: 'terminal',
          terminal: { id: 't4', nodeId: 'n4', name: 'T4', maestroRequest: 'texto' },
        },
        {
          kind: 'terminal',
          terminal: {
            id: 't5',
            nodeId: 'n5',
            name: 'T5',
            maestroRequest: { message: 'Só mensagem', createdAt: 123 },
          },
        },
      ],
    });

    expect(feed.terminals[0]?.maestroRequest).toEqual({
      message: 'Preciso de você',
      createdAt: '2026-11-12T10:00:00Z',
    });
    expect(feed.terminals[1]?.maestroRequest).toBeUndefined();
    expect(feed.terminals[2]?.maestroRequest).toBeUndefined();
    expect(feed.terminals[3]?.maestroRequest).toBeUndefined();
    expect(feed.terminals[4]?.maestroRequest).toEqual({ message: 'Só mensagem' });
  });

  it('descarta kinds desconhecidos e terminais inválidos', () => {
    const feed = parseFeed({
      workspace: { id: 'ws', name: 'Workspace' },
      items: [
        { kind: 'note', note: {} },
        { kind: 'futureKind', futureKind: {} },
        { kind: 'terminal', terminal: { id: 'sem-node', name: 'Sem node' } },
        { kind: 'terminal', terminal: 'não é objeto' },
        {
          kind: 'terminal',
          terminal: {
            id: 't1',
            nodeId: 'n1',
            name: 'T1',
            preview: ['ok', 7, null],
            isRunning: null,
          },
        },
      ],
    });

    expect(feed.terminals).toHaveLength(1);
    expect(feed.terminals[0]).toEqual({
      id: 't1',
      nodeId: 'n1',
      name: 'T1',
      isRunning: false,
      needsAttention: false,
      isActive: false,
      isManager: false,
      preview: ['ok'],
    });
    expect(feed.floors).toEqual([]);
  });

  it('omite floorId nulo', () => {
    const feed = parseFeed({
      workspace: { id: 'ws', name: 'Workspace' },
      items: [
        {
          kind: 'terminal',
          terminal: { id: 't1', nodeId: 'n1', name: 'T1', floorId: null, status: null },
        },
      ],
    });
    expect(feed.terminals[0]?.floorId).toBeUndefined();
    expect(feed.terminals[0]?.status).toBeUndefined();
  });

  it('exige um workspace válido', () => {
    const error = captureWireError(() =>
      parseFeed({ workspace: { name: 'Sem id' }, items: [] }),
    );
    expect(error.code).toBe('unknown');
    expect(error.message).toBe('Invalid response from Maestri.');
  });

  it('aceita floors e items ausentes', () => {
    const feed = parseFeed({ workspace: { id: 'ws', name: 'Workspace' } });
    expect(feed.floors).toEqual([]);
    expect(feed.terminals).toEqual([]);
    expect(feed.epoch).toBeUndefined();
  });
});
