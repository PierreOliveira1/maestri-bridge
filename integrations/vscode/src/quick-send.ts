import * as vscode from 'vscode';
import { pickAgent, toAgentTarget } from './agent-picker.ts';
import { deliver } from './delivery.ts';
import { collectReferences } from './editor-references.ts';
import { t } from './i18n/index.ts';
import { summarizeReferences } from './send-items.ts';
import type { MaestriSession } from './session.ts';
import type { TargetMemory } from './target-memory.ts';

export async function runQuickSend(
  session: MaestriSession,
  memory: TargetMemory,
): Promise<void> {
  const client = await session.ensureClient();
  if (client === undefined) {
    return;
  }

  const editor = vscode.window.activeTextEditor;
  const references = editor === undefined ? [] : collectReferences(editor);

  const picked = await pickAgent({
    session,
    client,
    memory,
    references,
    filePath: editor?.document.uri.fsPath,
  });
  if (picked === undefined) {
    return;
  }

  const message = await vscode.window.showInputBox({
    title: t('compose.message.title', { name: picked.terminal.name }),
    prompt:
      references.length > 0
        ? t('compose.message.prompt', { summary: summarizeReferences(references) })
        : undefined,
    placeHolder: t('compose.message.placeholder'),
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim() === '' && !references.some((reference) => reference.text)
        ? t('compose.message.required')
        : undefined,
  });
  if (message === undefined) {
    return;
  }

  await deliver({
    session,
    client,
    memory,
    target: toAgentTarget(picked),
    message,
    references,
  });
}
