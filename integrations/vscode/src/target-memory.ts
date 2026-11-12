export interface MementoLike {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export interface AgentTarget {
  workspaceId: string;
  workspaceName: string;
  floorId?: string;
  floorName?: string;
  terminalId: string;
  terminalName: string;
}

const LAST_TARGET_KEY = 'maestriBridge.lastTarget';
const LAST_WORKSPACE_KEY = 'maestriBridge.lastWorkspaceId';
const LAST_TERMINALS_KEY = 'maestriBridge.lastTerminals';

export class TargetMemory {
  constructor(private readonly memento: MementoLike) {}

  lastTarget(): AgentTarget | undefined {
    const raw = this.memento.get<unknown>(LAST_TARGET_KEY);
    if (!isRecord(raw)) {
      return undefined;
    }

    const { workspaceId, workspaceName, terminalId, terminalName } = raw;
    if (
      !isNonEmptyString(workspaceId) ||
      !isNonEmptyString(workspaceName) ||
      !isNonEmptyString(terminalId) ||
      !isNonEmptyString(terminalName)
    ) {
      return undefined;
    }

    const target: AgentTarget = { workspaceId, workspaceName, terminalId, terminalName };
    const floorId = raw.floorId;
    if (isNonEmptyString(floorId)) {
      target.floorId = floorId;
    }
    const floorName = raw.floorName;
    if (isNonEmptyString(floorName)) {
      target.floorName = floorName;
    }
    return target;
  }

  lastWorkspaceId(): string | undefined {
    const value = this.memento.get<unknown>(LAST_WORKSPACE_KEY);
    return isNonEmptyString(value) ? value : undefined;
  }

  lastTerminalId(workspaceId: string): string | undefined {
    const terminals = this.memento.get<unknown>(LAST_TERMINALS_KEY);
    if (!isRecord(terminals)) {
      return undefined;
    }
    const value = terminals[workspaceId];
    return isNonEmptyString(value) ? value : undefined;
  }

  async remember(target: AgentTarget): Promise<void> {
    const previous = this.memento.get<unknown>(LAST_TERMINALS_KEY);
    const terminals = isRecord(previous) ? previous : {};

    await this.memento.update(LAST_WORKSPACE_KEY, target.workspaceId);
    await this.memento.update(LAST_TARGET_KEY, target);
    await this.memento.update(LAST_TERMINALS_KEY, {
      ...terminals,
      [target.workspaceId]: target.terminalId,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}
