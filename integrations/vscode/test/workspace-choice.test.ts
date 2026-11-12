import { describe, expect, it } from 'vitest';
import type { WorkspaceSummary } from '@maestri-bridge/core';
import { chooseWorkspace } from '../src/workspace-choice.ts';

function workspace(
  id: string,
  workingDirectory?: string,
  isLoaded = false,
): WorkspaceSummary {
  return { id, name: id.toUpperCase(), workingDirectory, isLoaded, isLocked: false };
}

describe('chooseWorkspace', () => {
  const a = workspace('a', '/projetos/a');
  const b = workspace('b', '/projetos/b', true);

  it('prioriza o workspace do arquivo', () => {
    expect(
      chooseWorkspace({
        workspaces: [a, b],
        filePath: '/projetos/a/src/app.ts',
        folderPath: '/projetos/b',
        rememberedWorkspaceId: 'b',
        activeWorkspaceId: 'b',
      })?.id,
    ).toBe('a');
  });

  it('usa o workspace da pasta quando o arquivo não casa', () => {
    expect(
      chooseWorkspace({
        workspaces: [a, b],
        filePath: '/sem-match/app.ts',
        folderPath: '/projetos/b',
        rememberedWorkspaceId: 'a',
      })?.id,
    ).toBe('b');
  });

  it('usa o workspace lembrado', () => {
    expect(
      chooseWorkspace({ workspaces: [a, b], rememberedWorkspaceId: 'a', activeWorkspaceId: 'b' })
        ?.id,
    ).toBe('a');
  });

  it('usa o workspace ativo', () => {
    expect(
      chooseWorkspace({ workspaces: [a, b], rememberedWorkspaceId: 'zzz', activeWorkspaceId: 'a' })
        ?.id,
    ).toBe('a');
  });

  it('usa o primeiro workspace carregado', () => {
    const notLoaded = workspace('x', undefined, false);
    expect(chooseWorkspace({ workspaces: [notLoaded, b] })?.id).toBe('b');
  });

  it('usa o primeiro workspace como último recurso', () => {
    const c = workspace('c');
    const d = workspace('d');
    expect(chooseWorkspace({ workspaces: [c, d] })?.id).toBe('c');
  });

  it('devolve undefined sem workspaces', () => {
    expect(chooseWorkspace({ workspaces: [] })).toBeUndefined();
  });
});
