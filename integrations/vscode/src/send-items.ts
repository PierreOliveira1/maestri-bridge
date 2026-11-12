import { formatReferenceHeader, meaningfulPreview } from '@maestri-bridge/core';
import type {
  CodeReference,
  FloorSummary,
  TerminalSummary,
  WorkspaceSummary,
} from '@maestri-bridge/core';
import { t } from './i18n/index.ts';

export interface TerminalItemView {
  terminalId: string;
  label: string;
  description: string;
  detail?: string;
}

export function terminalItemView(terminal: TerminalSummary): TerminalItemView {
  const view: TerminalItemView = {
    terminalId: terminal.id,
    label: `${terminalIcon(terminal)} ${terminal.name}`,
    description: terminalDescription(terminal),
  };

  const detail = previewDetail(terminal.preview);
  if (detail !== undefined) {
    view.detail = detail;
  }

  return view;
}

export function agentLabel(agentType: string | undefined): string {
  switch (agentType) {
    case undefined:
      return '';
    case 'claude_code':
      return 'Claude Code';
    case 'open_code':
      return 'OpenCode';
    case 'codex':
      return 'Codex';
    case 'gemini':
      return 'Gemini';
    case 'generic_shell':
      return 'Shell';
    default:
      return agentType
        .split('_')
        .map((word) => (word === '' ? '' : word.charAt(0).toUpperCase() + word.slice(1)))
        .join(' ');
  }
}

export function summarizeReferences(references: readonly CodeReference[]): string {
  if (references.length === 0) {
    return '';
  }

  const headers = references
    .slice(0, 2)
    .map((reference) => formatReferenceHeader(reference));
  const extra = references.length > 2 ? ` +${references.length - 2}` : '';
  return `${headers.join(', ')}${extra}`;
}

export function workspaceDetail(workspace: WorkspaceSummary): string {
  const running = workspace.runningTerminalCount ?? 0;
  const total = workspace.terminalCount ?? 0;
  return t(
    workspace.isLoaded ? 'agents.workspace.detailLoaded' : 'agents.workspace.detail',
    { running, total },
  );
}

export function floorLabel(floor: FloorSummary): string {
  return floor.id === undefined ? t('agents.floor.ground') : floor.name;
}

function terminalIcon(terminal: TerminalSummary): string {
  if (terminal.needsAttention) {
    return '$(bell-dot)';
  }
  if (terminal.isManager) {
    return '$(star-full)';
  }
  if (!terminal.isRunning) {
    return '$(circle-slash)';
  }
  return '$(terminal)';
}

function terminalDescription(terminal: TerminalSummary): string {
  const parts: string[] = [];
  if (terminal.roleName !== undefined && terminal.roleName !== '') {
    parts.push(terminal.roleName);
  }
  const agent = agentLabel(terminal.agentType);
  if (agent !== '') {
    parts.push(agent);
  }
  if (!terminal.isRunning) {
    parts.push(t('agents.status.stopped'));
  }
  if (terminal.needsAttention) {
    parts.push(t('agents.status.attention'));
  }
  return parts.join(' · ');
}

function previewDetail(preview: readonly string[]): string | undefined {
  const last = meaningfulPreview(preview).at(-1);
  if (last === undefined) {
    return undefined;
  }
  return last.length > 90 ? `${last.slice(0, 89)}…` : last;
}
