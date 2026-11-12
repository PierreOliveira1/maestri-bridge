import { isWireError, WireError } from './errors.ts';
import { wireRequest } from './http.ts';
import type { WireRequestOptions } from './http.ts';
import { parseFeed, parseHostInfo, parseWorkspaces } from './models.ts';
import type { FeedSnapshot, HostInfo, WorkspaceSummary } from './models.ts';
import type { Credentials } from './types.ts';

export interface WireClientOptions {
  timeoutMs?: number;
}

export class WireClient {
  private readonly credentials: Credentials;
  private readonly options: WireClientOptions;

  constructor(credentials: Credentials, options?: WireClientOptions) {
    this.credentials = credentials;
    this.options = options ?? {};
  }

  async info(): Promise<HostInfo> {
    const raw = await this.request<unknown>({ method: 'GET', path: '/api/info' });
    const info = parseHostInfo(raw);
    if (info.protocolVersion !== 1) {
      throw new WireError({
        code: 'protocolMismatch',
        message: 'Unsupported Maestri protocol version.',
        messageId: 'unsupportedProtocol',
      });
    }
    return info;
  }

  async listWorkspaces(): Promise<WorkspaceSummary[]> {
    const raw = await this.request<unknown>({ method: 'GET', path: '/api/workspaces' });
    return parseWorkspaces(raw).filter((workspace) => !workspace.isLocked);
  }

  async getFeed(workspaceId: string, floor?: string): Promise<FeedSnapshot> {
    const raw = await this.request<unknown>({
      method: 'GET',
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}/feed`,
      query: floor === undefined ? undefined : { floor },
    });
    return parseFeed(raw);
  }

  async sendPrompt(terminalId: string, text: string): Promise<void> {
    if (text.trim() === '') {
      throw new WireError({
        code: 'invalidRequest',
        message: 'The message is empty.',
        messageId: 'emptyMessage',
      });
    }

    try {
      await this.request({
        method: 'POST',
        path: `/api/terminals/${encodeURIComponent(terminalId)}/prompt`,
        json: { text },
      });
    } catch (error) {
      if (isWireError(error) && error.status === 409) {
        throw new WireError({
          code: 'conflict',
          status: 409,
          message: 'This terminal is not running in Maestri.',
          messageId: 'terminalNotRunning',
          cause: error,
        });
      }
      throw error;
    }
  }

  async focusTerminal(terminalId: string): Promise<void> {
    await this.request({
      method: 'POST',
      path: `/api/terminals/${encodeURIComponent(terminalId)}/focus`,
    });
  }

  async approve(terminalId: string): Promise<void> {
    await this.respondToPrompt(terminalId, 'approve');
  }

  async reject(terminalId: string): Promise<void> {
    await this.respondToPrompt(terminalId, 'reject');
  }

  private async respondToPrompt(
    terminalId: string,
    action: 'approve' | 'reject',
  ): Promise<void> {
    try {
      await this.request({
        method: 'POST',
        path: `/api/terminals/${encodeURIComponent(terminalId)}/${action}`,
      });
    } catch (error) {
      if (isWireError(error) && error.status === 409) {
        throw new WireError({
          code: 'conflict',
          status: 409,
          message: 'This agent is not waiting for an answer.',
          messageId: 'agentNotWaiting',
          cause: error,
        });
      }
      throw error;
    }
  }

  private request<T = unknown>(options: WireRequestOptions): Promise<T> {
    return wireRequest<T>(
      { host: this.credentials.host, port: this.credentials.port, pin: this.credentials.pin },
      {
        ...options,
        token: this.credentials.token,
        timeoutMs: this.options.timeoutMs,
      },
    );
  }
}
