import * as vscode from 'vscode';
import { formatPrompt } from '@maestri-bridge/core';
import type { CodeReference, WireClient } from '@maestri-bridge/core';
import { showFlowError } from './flow-errors.ts';
import { t } from './i18n/index.ts';
import type { MaestriSession } from './session.ts';
import type { AgentTarget, TargetMemory } from './target-memory.ts';

export async function deliver(options: {
  session: MaestriSession;
  client: WireClient;
  memory: TargetMemory;
  target: AgentTarget;
  message: string;
  references: readonly CodeReference[];
  notifySuccess?: boolean;
}): Promise<boolean> {
  const {
    session,
    client,
    memory,
    target,
    message,
    references,
    notifySuccess = true,
  } = options;
  const text = formatPrompt(message, references, {
    heading: t('compose.prompt.heading'),
  });

  if (text.trim() === '') {
    void vscode.window.showWarningMessage(t('compose.message.empty'));
    return false;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t('compose.delivery.sending', { name: target.terminalName }),
      },
      () => client.sendPrompt(target.terminalId, text),
    );
  } catch (error) {
    await showFlowError(session, error);
    return false;
  }

  await memory.remember(target);

  if (notifySuccess) {
    const openInMaestri = t('general.openInMaestri');
    void vscode.window
      .showInformationMessage(
        t('compose.delivery.sent', { name: target.terminalName }),
        openInMaestri,
      )
      .then((choice) => {
        if (choice !== openInMaestri) {
          return;
        }
        void client
          .focusTerminal(target.terminalId)
          .catch((error: unknown) => showFlowError(session, error));
      });
  }

  return true;
}
