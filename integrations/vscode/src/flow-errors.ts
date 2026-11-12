import * as vscode from 'vscode';
import { isWireError } from '@maestri-bridge/core';
import { describeError } from './error-messages.ts';
import { t } from './i18n/index.ts';
import { runPairingFlow } from './pairing-flow.ts';
import type { MaestriSession } from './session.ts';

export async function showFlowError(session: MaestriSession, error: unknown): Promise<void> {
  const message = describeError(error);

  if (isWireError(error) && error.code === 'unauthorized') {
    const pairAgain = t('errors.pairAgain');
    const choice = await vscode.window.showErrorMessage(message, pairAgain);
    if (choice === pairAgain) {
      await runPairingFlow(session.store);
    }
    return;
  }

  void vscode.window.showErrorMessage(message);
}
