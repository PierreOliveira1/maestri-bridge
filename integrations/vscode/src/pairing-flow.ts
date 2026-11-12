import * as os from 'node:os';
import * as vscode from 'vscode';
import { fetchServerKey, pair } from '@maestri-bridge/core';
import type { Credentials } from '@maestri-bridge/core';
import type { CredentialStore } from './credential-store.ts';
import { describeError, describePairingError } from './error-messages.ts';
import { t } from './i18n/index.ts';

type PairingMethod = 'code' | 'password';

interface PairingMethodItem extends vscode.QuickPickItem {
  method: PairingMethod;
}

export async function runPairingFlow(store: CredentialStore): Promise<Credentials | undefined> {
  const config = vscode.workspace.getConfiguration('maestriBridge');
  const host = config.get<string>('host', 'localhost');
  const port = config.get<number>('port', 7434);

  let pin: string;
  let hex: string;
  try {
    const serverKey = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t('pairing.connect.title'),
      },
      () => fetchServerKey({ host, port }),
    );
    pin = serverKey.pin;
    hex = serverKey.hex;
  } catch (error) {
    void vscode.window.showErrorMessage(describeError(error));
    return undefined;
  }

  const confirmLabel = t('pairing.security.confirm');
  const confirmation = await vscode.window.showInformationMessage(
    t('pairing.security.title'),
    {
      modal: true,
      detail: t('pairing.security.detail', { hex }),
    },
    confirmLabel,
  );
  if (confirmation !== confirmLabel) {
    return undefined;
  }

  const methodItems: PairingMethodItem[] = [
    {
      label: `$(key) ${t('pairing.method.code')}`,
      description: t('pairing.method.codeDescription'),
      method: 'code',
    },
    {
      label: `$(lock) ${t('pairing.method.password')}`,
      description: t('pairing.method.passwordDescription'),
      method: 'password',
    },
  ];
  const methodItem = await vscode.window.showQuickPick(methodItems, {
    title: t('pairing.method.title'),
    placeHolder: t('pairing.method.placeholder'),
  });
  if (methodItem === undefined) {
    return undefined;
  }

  const secret = await promptSecret(methodItem.method);
  if (secret === undefined) {
    return undefined;
  }

  let credentials: Credentials;
  try {
    credentials = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t('pairing.pairing.title'),
      },
      () =>
        pair({
          host,
          port,
          pin,
          deviceName: `VS Code (${os.hostname()})`,
          deviceIdentifier: vscode.env.machineId,
          ...(methodItem.method === 'code' ? { code: secret } : { password: secret }),
        }),
    );
  } catch (error) {
    void vscode.window.showErrorMessage(describePairingError(error));
    return undefined;
  }

  await store.set(credentials);
  void vscode.window.showInformationMessage(
    credentials.role === 'guest' ? t('pairing.successGuest') : t('pairing.success'),
  );
  return credentials;
}

async function promptSecret(method: PairingMethod): Promise<string | undefined> {
  if (method === 'code') {
    return vscode.window.showInputBox({
      title: t('pairing.method.code'),
      prompt: t('pairing.code.prompt'),
      ignoreFocusOut: true,
      validateInput: (value) =>
        /^\d{6}$/.test(value.replace(/\s+/g, '')) ? undefined : t('pairing.code.invalid'),
    });
  }

  return vscode.window.showInputBox({
    title: t('pairing.password.title'),
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() === '' ? t('pairing.password.required') : undefined),
  });
}
