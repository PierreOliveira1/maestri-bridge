import { WireError } from './errors.ts';
import type { DeviceRole } from './types.ts';

export interface HostInfo {
  name: string;
  protocolVersion: number;
  capabilities: string[];
  requiresPassword?: boolean;
  activeWorkspaceId?: string;
  role?: DeviceRole;
  hosts?: string[];
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  activeFloorId?: string;
  workingDirectory?: string;
  isLoaded: boolean;
  isLocked: boolean;
  terminalCount?: number;
  runningTerminalCount?: number;
  attentionCount?: number;
}

export interface FloorSummary {
  id?: string;
  name: string;
  isActive: boolean;
  attentionCount?: number;
}

export interface MaestroRequest {
  message: string;
  createdAt?: string;
}

export interface TerminalSummary {
  id: string;
  nodeId: string;
  name: string;
  agentType?: string;
  status?: string;
  isRunning: boolean;
  needsAttention: boolean;
  isActive: boolean;
  isManager: boolean;
  floorId?: string;
  floorName?: string;
  roleName?: string;
  color?: string;
  lastActiveAt?: string;
  maestroRequest?: MaestroRequest;
  preview: string[];
}

export interface PendingPrompt {
  terminalId: string;
  prompt: string;
}

export interface FeedSnapshot {
  workspace: WorkspaceSummary;
  floors: FloorSummary[];
  terminals: TerminalSummary[];
  pendingPrompts: PendingPrompt[];
  epoch?: string;
}

export function parseHostInfo(raw: unknown): HostInfo {
  if (!isRecord(raw)) {
    throw invalidResponse();
  }
  if (
    typeof raw.name !== 'string' ||
    typeof raw.protocolVersion !== 'number' ||
    !Array.isArray(raw.capabilities)
  ) {
    throw invalidResponse();
  }

  const info: HostInfo = {
    name: raw.name,
    protocolVersion: raw.protocolVersion,
    capabilities: raw.capabilities.filter(
      (capability): capability is string => typeof capability === 'string',
    ),
  };

  const requiresPassword = optionalBoolean(raw.requiresPassword);
  if (requiresPassword !== undefined) {
    info.requiresPassword = requiresPassword;
  }
  const activeWorkspaceId = optionalString(raw.activeWorkspaceId);
  if (activeWorkspaceId !== undefined) {
    info.activeWorkspaceId = activeWorkspaceId;
  }
  const role = optionalString(raw.role);
  if (role !== undefined) {
    info.role = role;
  }
  if (Array.isArray(raw.hosts)) {
    info.hosts = raw.hosts.filter((host): host is string => typeof host === 'string');
  }

  return info;
}

export function parseWorkspaces(raw: unknown): WorkspaceSummary[] {
  if (!isRecord(raw) || !Array.isArray(raw.workspaces)) {
    throw invalidResponse();
  }
  const workspaces: WorkspaceSummary[] = [];
  for (const item of raw.workspaces) {
    const workspace = parseWorkspaceItem(item);
    if (workspace !== undefined) {
      workspaces.push(workspace);
    }
  }
  return workspaces;
}

export function parseFeed(raw: unknown): FeedSnapshot {
  if (!isRecord(raw)) {
    throw invalidResponse();
  }
  const workspace = parseWorkspaceItem(raw.workspace);
  if (workspace === undefined) {
    throw invalidResponse();
  }

  const floors: FloorSummary[] = [];
  if (Array.isArray(raw.floors)) {
    for (const item of raw.floors) {
      const floor = parseFloorItem(item);
      if (floor !== undefined) {
        floors.push(floor);
      }
    }
  }

  const terminals: TerminalSummary[] = [];
  const pendingPrompts: PendingPrompt[] = [];
  const terminalIds = new Set<string>();

  const addTerminal = (terminal: TerminalSummary): void => {
    if (terminalIds.has(terminal.id)) {
      return;
    }
    terminalIds.add(terminal.id);
    terminals.push(terminal);
  };

  if (Array.isArray(raw.items)) {
    for (const item of raw.items) {
      if (!isRecord(item)) {
        continue;
      }
      if (item.kind === 'terminal') {
        const terminal = parseTerminalCard(item.terminal);
        if (terminal !== undefined) {
          addTerminal(terminal);
        }
        continue;
      }
      if (item.kind === 'pendingPrompt') {
        const terminal = parseTerminalCard(item.terminal);
        if (terminal === undefined || typeof item.prompt !== 'string') {
          continue;
        }
        pendingPrompts.push({ terminalId: terminal.id, prompt: item.prompt });
        addTerminal(terminal);
      }
    }
  }

  const snapshot: FeedSnapshot = { workspace, floors, terminals, pendingPrompts };
  const epoch = optionalString(raw.epoch);
  if (epoch !== undefined) {
    snapshot.epoch = epoch;
  }
  return snapshot;
}

function parseWorkspaceItem(raw: unknown): WorkspaceSummary | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const id = optionalString(raw.id);
  const name = optionalString(raw.name);
  if (id === undefined || name === undefined) {
    return undefined;
  }

  const workspace: WorkspaceSummary = {
    id,
    name,
    isLoaded: optionalBoolean(raw.isLoaded) ?? false,
    isLocked: optionalBoolean(raw.isLocked) ?? false,
  };

  const activeFloorId = optionalString(raw.activeFloorId);
  if (activeFloorId !== undefined) {
    workspace.activeFloorId = activeFloorId;
  }
  const workingDirectory = optionalString(raw.workingDirectory);
  if (workingDirectory !== undefined) {
    workspace.workingDirectory = workingDirectory;
  }
  const terminalCount = optionalNumber(raw.terminalCount);
  if (terminalCount !== undefined) {
    workspace.terminalCount = terminalCount;
  }
  const runningTerminalCount = optionalNumber(raw.runningTerminalCount);
  if (runningTerminalCount !== undefined) {
    workspace.runningTerminalCount = runningTerminalCount;
  }
  const attentionCount = optionalNumber(raw.attentionCount);
  if (attentionCount !== undefined) {
    workspace.attentionCount = attentionCount;
  }

  return workspace;
}

function parseFloorItem(raw: unknown): FloorSummary | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const name = optionalString(raw.name);
  if (name === undefined) {
    return undefined;
  }

  const floor: FloorSummary = {
    name,
    isActive: optionalBoolean(raw.isActive) ?? false,
  };

  const id = optionalString(raw.id);
  if (id !== undefined) {
    floor.id = id;
  }
  const attentionCount = optionalNumber(raw.attentionCount);
  if (attentionCount !== undefined) {
    floor.attentionCount = attentionCount;
  }

  return floor;
}

function parseTerminalCard(raw: unknown): TerminalSummary | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const terminalRaw = raw;

  const id = optionalString(terminalRaw.id);
  const nodeId = optionalString(terminalRaw.nodeId);
  const name = optionalString(terminalRaw.name);
  if (id === undefined || nodeId === undefined || name === undefined) {
    return undefined;
  }

  const terminal: TerminalSummary = {
    id,
    nodeId,
    name,
    isRunning: optionalBoolean(terminalRaw.isRunning) ?? false,
    needsAttention: optionalBoolean(terminalRaw.needsAttention) ?? false,
    isActive: optionalBoolean(terminalRaw.isActive) ?? false,
    isManager: optionalBoolean(terminalRaw.isManager) ?? false,
    preview: Array.isArray(terminalRaw.preview)
      ? terminalRaw.preview.filter((line): line is string => typeof line === 'string')
      : [],
  };

  const agentType = optionalString(terminalRaw.agentType);
  if (agentType !== undefined) {
    terminal.agentType = agentType;
  }
  const status = optionalString(terminalRaw.status);
  if (status !== undefined) {
    terminal.status = status;
  }
  const floorId = optionalString(terminalRaw.floorId);
  if (floorId !== undefined) {
    terminal.floorId = floorId;
  }
  const floorName = optionalString(terminalRaw.floorName);
  if (floorName !== undefined) {
    terminal.floorName = floorName;
  }
  const roleName = optionalString(terminalRaw.roleName);
  if (roleName !== undefined) {
    terminal.roleName = roleName;
  }
  const color = optionalString(terminalRaw.color);
  if (color !== undefined) {
    terminal.color = color;
  }
  const lastActiveAt = optionalString(terminalRaw.lastActiveAt);
  if (lastActiveAt !== undefined) {
    terminal.lastActiveAt = lastActiveAt;
  }
  const maestroRequest = parseMaestroRequest(terminalRaw.maestroRequest);
  if (maestroRequest !== undefined) {
    terminal.maestroRequest = maestroRequest;
  }

  return terminal;
}

function parseMaestroRequest(raw: unknown): MaestroRequest | undefined {
  if (!isRecord(raw) || typeof raw.message !== 'string' || raw.message.trim() === '') {
    return undefined;
  }
  const request: MaestroRequest = { message: raw.message };
  const createdAt = optionalString(raw.createdAt);
  if (createdAt !== undefined) {
    request.createdAt = createdAt;
  }
  return request;
}

function invalidResponse(): WireError {
  return new WireError({
    code: 'unknown',
    message: 'Invalid response from Maestri.',
    messageId: 'invalidResponse',
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
