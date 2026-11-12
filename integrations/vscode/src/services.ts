import type * as vscode from 'vscode';
import type { MaestriSession } from './session.ts';
import type { CodeReference } from '@maestri-bridge/core';
import type { AgentTarget, TargetMemory } from './target-memory.ts';

export interface ExtensionServices {
  context: vscode.ExtensionContext;
  session: MaestriSession;
  memory: TargetMemory;
}

export interface ComposerSeed {
  references?: CodeReference[];
  target?: AgentTarget;
  message?: string;
}
