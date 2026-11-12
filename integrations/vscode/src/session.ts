import * as vscode from 'vscode';
import { WireClient } from '@maestri-bridge/core';
import type { Credentials } from '@maestri-bridge/core';
import type { CredentialStore } from './credential-store.ts';
import { runPairingFlow } from './pairing-flow.ts';

const PAIRED_CONTEXT_KEY = 'maestriBridge.paired';

export class MaestriSession implements vscode.Disposable {
  private client: WireClient | undefined;
  private credentials: Credentials | undefined;
  private credentialsKnown = false;
  private readonly listener: vscode.Disposable;

  readonly onDidChangeCredentials: vscode.Event<void>;

  constructor(readonly store: CredentialStore) {
    this.onDidChangeCredentials = store.onDidChange;
    this.listener = store.onDidChange(() => {
      this.invalidate();
      void this.refreshPairedContext();
    });
    void this.refreshPairedContext();
  }

  async ensureClient(): Promise<WireClient | undefined> {
    const credentials = await this.loadCredentials();
    if (credentials !== undefined) {
      return this.clientFor(credentials);
    }

    const paired = await runPairingFlow(this.store);
    if (paired === undefined) {
      return undefined;
    }

    return this.clientFor(paired);
  }

  async currentClient(): Promise<WireClient | undefined> {
    const credentials = await this.loadCredentials();
    if (credentials === undefined) {
      return undefined;
    }
    return this.clientFor(credentials);
  }

  dispose(): void {
    this.listener.dispose();
    this.invalidate();
  }

  private async loadCredentials(): Promise<Credentials | undefined> {
    if (!this.credentialsKnown) {
      this.credentials = await this.store.get();
      this.credentialsKnown = true;
    }
    return this.credentials;
  }

  private clientFor(credentials: Credentials): WireClient {
    if (this.client === undefined) {
      this.client = new WireClient(credentials);
    }
    return this.client;
  }

  private invalidate(): void {
    this.client = undefined;
    this.credentials = undefined;
    this.credentialsKnown = false;
  }

  private async refreshPairedContext(): Promise<void> {
    const credentials = await this.store.get();
    await vscode.commands.executeCommand(
      'setContext',
      PAIRED_CONTEXT_KEY,
      credentials !== undefined,
    );
  }
}
