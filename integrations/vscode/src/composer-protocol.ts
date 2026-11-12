import { t } from './i18n/index.ts';
import type { LocaleId } from './i18n/index.ts';

export interface ComposerReferenceView {
  id: string;
  header: string;
  path: string;
  startLine?: number;
  text?: string;
}

export interface ComposerTargetView {
  terminalName: string;
  workspaceName: string;
  floorText?: string;
}

export interface ComposerNotice {
  kind: 'success' | 'error';
  text: string;
  canOpenInMaestri?: boolean;
}

export interface ComposerState {
  target?: ComposerTargetView;
  references: ComposerReferenceView[];
  message: string;
  sending: boolean;
  notice?: ComposerNotice;
  isMac: boolean;
  locale: LocaleId;
}

export type ToWebview = { type: 'state'; state: ComposerState } | { type: 'focusMessage' };

export type FromWebview =
  | { type: 'ready' }
  | { type: 'pickAgent' }
  | { type: 'addSelection' }
  | { type: 'removeReference'; id: string }
  | { type: 'messageChanged'; message: string }
  | { type: 'send'; message: string }
  | { type: 'openInMaestri' }
  | { type: 'dismissNotice' };

export function parseFromWebview(raw: unknown): FromWebview | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  switch (raw.type) {
    case 'ready':
      return { type: 'ready' };
    case 'pickAgent':
      return { type: 'pickAgent' };
    case 'addSelection':
      return { type: 'addSelection' };
    case 'openInMaestri':
      return { type: 'openInMaestri' };
    case 'dismissNotice':
      return { type: 'dismissNotice' };
    case 'removeReference':
      return typeof raw.id === 'string' ? { type: 'removeReference', id: raw.id } : undefined;
    case 'messageChanged':
      return typeof raw.message === 'string'
        ? { type: 'messageChanged', message: raw.message }
        : undefined;
    case 'send':
      return typeof raw.message === 'string' ? { type: 'send', message: raw.message } : undefined;
    default:
      return undefined;
  }
}

export function canSend(state: Pick<ComposerState, 'message' | 'references' | 'sending'>): boolean {
  return (
    !state.sending &&
    (state.message.trim() !== '' ||
      state.references.some((reference) => (reference.text ?? '').trim() !== ''))
  );
}

export function sendLabel(state: ComposerState): string {
  if (state.sending) {
    return t('compose.send.sending');
  }
  return state.target !== undefined
    ? t('compose.send.toAgent', { name: state.target.terminalName })
    : t('compose.send.pickAgent');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
