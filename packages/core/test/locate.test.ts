import { describe, expect, it } from 'vitest';
import { locateTerminal } from '../src/locate.ts';
import type { TerminalDirectory } from '../src/locate.ts';
import type { FeedSnapshot, TerminalSummary, WorkspaceSummary } from '../src/models.ts';

function workspace(id: string, isLoaded = true): WorkspaceSummary {
  return { id, name: `Workspace ${id}`, isLoaded, isLocked: false };
}

function terminal(id: string): TerminalSummary {
  return {
    id,
    nodeId: `node-${id}`,
    name: id,
    isRunning: true,
    needsAttention: false,
    isActive: false,
    isManager: false,
    preview: [],
  };
}

function snapshot(workspaceId: string, terminalIds: string[]): FeedSnapshot {
  return {
    workspace: workspace(workspaceId),
    floors: [],
    terminals: terminalIds.map((id) => terminal(id)),
    pendingPrompts: [],
  };
}

interface FakeDirectory extends TerminalDirectory {
  readonly feedCalls: string[];
  readonly listCalls: number;
}

function fakeDirectory(
  workspaces: WorkspaceSummary[],
  feeds: Record<string, FeedSnapshot | Error>,
): FakeDirectory {
  const feedCalls: string[] = [];
  let listCalls = 0;

  return {
    feedCalls,
    get listCalls() {
      return listCalls;
    },
    async listWorkspaces() {
      listCalls += 1;
      return workspaces;
    },
    async getFeed(workspaceId: string) {
      feedCalls.push(workspaceId);
      const feed = feeds[workspaceId];
      if (feed === undefined) {
        throw new Error(`Feed ausente para ${workspaceId}.`);
      }
      if (feed instanceof Error) {
        throw feed;
      }
      return feed;
    },
  };
}

describe('locateTerminal', () => {
  it('acha em snapshot sem chamar a rede', async () => {
    const target = terminal('t1');
    const feed = snapshot('w1', []);
    feed.terminals.push(target);
    const directory: TerminalDirectory = {
      async listWorkspaces() {
        throw new Error('não deveria listar');
      },
      async getFeed() {
        throw new Error('não deveria buscar');
      },
    };

    const found = await locateTerminal(directory, 't1', { snapshots: [feed] });

    expect(found).toEqual({ workspace: feed.workspace, terminal: target });
  });

  it('prioriza o workspace preferido e depois segue a ordem da lista', async () => {
    const directory = fakeDirectory(
      [workspace('w1'), workspace('w2'), workspace('w3')],
      {
        w1: snapshot('w1', ['target']),
        w2: snapshot('w2', []),
        w3: snapshot('w3', []),
      },
    );

    const found = await locateTerminal(directory, 'target', {
      preferredWorkspaceId: 'w3',
    });

    expect(directory.feedCalls).toEqual(['w3', 'w1']);
    expect(found?.workspace.id).toBe('w1');
  });

  it('ignora workspaces não carregados', async () => {
    const directory = fakeDirectory(
      [workspace('w1', false), workspace('w2')],
      {
        w1: snapshot('w1', ['target']),
        w2: snapshot('w2', ['target']),
      },
    );

    const found = await locateTerminal(directory, 'target');

    expect(directory.feedCalls).toEqual(['w2']);
    expect(found?.workspace.id).toBe('w2');
  });

  it('segue adiante quando um getFeed falha', async () => {
    const directory = fakeDirectory(
      [workspace('w1'), workspace('w2')],
      {
        w1: new Error('falha'),
        w2: snapshot('w2', ['target']),
      },
    );

    const found = await locateTerminal(directory, 'target');

    expect(directory.feedCalls).toEqual(['w1', 'w2']);
    expect(found?.workspace.id).toBe('w2');
  });

  it('para de buscar ao achar', async () => {
    const directory = fakeDirectory(
      [workspace('w1'), workspace('w2')],
      {
        w1: snapshot('w1', ['target']),
        w2: snapshot('w2', ['target']),
      },
    );

    const found = await locateTerminal(directory, 'target');

    expect(directory.feedCalls).toEqual(['w1']);
    expect(found?.workspace.id).toBe('w1');
  });

  it('devolve undefined quando não encontra', async () => {
    const directory = fakeDirectory(
      [workspace('w1'), workspace('w2')],
      {
        w1: snapshot('w1', ['outro']),
        w2: snapshot('w2', ['mais-um']),
      },
    );

    const found = await locateTerminal(directory, 'target');

    expect(found).toBeUndefined();
    expect(directory.feedCalls).toEqual(['w1', 'w2']);
  });

  it('pula workspaces já cobertos por snapshot', async () => {
    const directory = fakeDirectory(
      [workspace('w1'), workspace('w2')],
      {
        w1: snapshot('w1', ['target']),
        w2: snapshot('w2', ['target']),
      },
    );

    const found = await locateTerminal(directory, 'target', {
      snapshots: [snapshot('w1', ['outro'])],
    });

    expect(directory.feedCalls).toEqual(['w2']);
    expect(found?.workspace.id).toBe('w2');
  });

  it('não usa workspace preferido quando ele não está carregado', async () => {
    const directory = fakeDirectory(
      [workspace('w1'), workspace('w2', false)],
      {
        w1: snapshot('w1', ['target']),
      },
    );

    const found = await locateTerminal(directory, 'target', {
      preferredWorkspaceId: 'w2',
    });

    expect(directory.feedCalls).toEqual(['w1']);
    expect(found?.workspace.id).toBe('w1');
  });

  it('procura no primeiro snapshot que contém o terminal', async () => {
    const first = snapshot('w1', ['target']);
    const second = snapshot('w2', ['target']);

    const found = await locateTerminal(
      {
        async listWorkspaces() {
          throw new Error('não deveria listar');
        },
        async getFeed() {
          throw new Error('não deveria buscar');
        },
      },
      'target',
      { snapshots: [first, second] },
    );

    expect(found).toEqual({ workspace: first.workspace, terminal: first.terminals[0] });
  });

  it('deixa o erro de listWorkspaces subir', async () => {
    const error = new Error('lista falhou');
    const directory: TerminalDirectory = {
      async listWorkspaces() {
        throw error;
      },
      async getFeed() {
        return snapshot('w1', []);
      },
    };

    await expect(locateTerminal(directory, 'target')).rejects.toBe(error);
  });
});
