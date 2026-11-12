import * as vscode from 'vscode';
import type { Credentials } from '@maestri-bridge/core';
import { parseCredentials } from './credentials.ts';

const SECRET_KEY = 'maestriBridge.credentials';

export class CredentialStore implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  private readonly secretListener: vscode.Disposable;

  readonly onDidChange: vscode.Event<void>;

  constructor(private readonly secrets: vscode.SecretStorage) {
    this.onDidChange = this.emitter.event;
    this.secretListener = secrets.onDidChange((event) => {
      if (event.key === SECRET_KEY) {
        this.emitter.fire();
      }
    });
  }

  async get(): Promise<Credentials | undefined> {
    const raw = await this.secrets.get(SECRET_KEY);
    return parseCredentials(raw);
  }

  async set(credentials: Credentials): Promise<void> {
    await this.secrets.store(SECRET_KEY, JSON.stringify(credentials));
    this.emitter.fire();
  }

  async clear(): Promise<void> {
    await this.secrets.delete(SECRET_KEY);
    this.emitter.fire();
  }

  dispose(): void {
    this.secretListener.dispose();
    this.emitter.dispose();
  }
}
