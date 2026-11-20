import type { LocaleId } from './i18n/index.ts';

export type ChatConnection = 'unpaired' | 'noTarget' | 'connecting' | 'live' | 'polling' | 'offline';

export type ChatEntryRole = 'user' | 'agent';

export type ChatEntryKindView = 'message' | 'progress' | 'final' | 'divider';

export interface ChatTargetView {
  terminalName: string;
  workspaceName: string;
  floorText?: string;
}

export interface ChatAttachmentView {
  id: string;
  filename: string;
  isImage: boolean;
}

export interface ChatEntryView {
  id: string;
  role: ChatEntryRole;
  kind: ChatEntryKindView;
  text: string;
  ts: string;
  authorName?: string;
  attachments: ChatAttachmentView[];
  pending?: boolean;
}

export interface ChatThreadView {
  slot: number;
  color: string;
  hasMessages: boolean;
  active: boolean;
}

export interface ChatThreadsView {
  canSelect: boolean;
  items: ChatThreadView[];
}

export interface ChatReferenceView {
  id: string;
  header: string;
  path: string;
  startLine?: number;
  text?: string;
}

export interface ChatDraftAttachmentView {
  id: string;
  fileName: string;
  isImage: boolean;
  uploading: boolean;
  failed: boolean;
}

export interface ChatComposerView {
  message: string;
  references: ChatReferenceView[];
  attachments: ChatDraftAttachmentView[];
  sending: boolean;
}

export interface ChatNotice {
  kind: 'error' | 'info';
  text: string;
}

export interface ChatViewState {
  locale: LocaleId;
  isMac: boolean;
  isOwner: boolean;
  connection: ChatConnection;
  target?: ChatTargetView;
  chatEnabled: boolean;
  status?: string;
  talkingToAgentName?: string;
  answeringAgentName?: string;
  turnInterrupted: boolean;
  pendingPrompt?: string;
  threads?: ChatThreadsView;
  entries: ChatEntryView[];
  hasOlder: boolean;
  loadingOlder: boolean;
  canClear: boolean;
  composer: ChatComposerView;
  notice?: ChatNotice;
}

export type MentionKind = 'agent' | 'file' | 'floor' | 'note' | 'portal' | 'action' | 'prompt';

export interface MentionView {
  kind: MentionKind;
  label: string;
  detail?: string;
  section?: string;
  insertText: string;
  token?: string;
}

export interface FollowBannerView {
  label: string;
  phase: 'following' | 'paused' | 'completed';
  accent: 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'yellow';
  toggleLabel: string;
  stopLabel: string;
  tooltip: string;
  context: string;
  file?: string;
  waitingLabel: string;
  note?: { label: string; location: string; message: string };
}

export type ChatToWebview =
  | { type: 'followState'; startLabel: string; follow?: FollowBannerView }
  | { type: 'state'; state: ChatViewState }
  | { type: 'focusMessage' }
  | { type: 'attachmentData'; id: string; dataUri: string }
  | { type: 'mentions'; query: string; items: MentionView[] }
  | { type: 'pastedAsReference'; start: number; end: number; text: string };

export type ChatFromWebview =
  | { type: 'followAction'; action: 'start' | 'pause' | 'resume' | 'stop' }
  | { type: 'ready' }
  | { type: 'pickAgent' }
  | { type: 'enableChat' }
  | { type: 'selectThread'; slot: number }
  | { type: 'clearThread'; slot: number }
  | { type: 'loadOlder' }
  | { type: 'deleteEntry'; id: string }
  | { type: 'clearHistory' }
  | { type: 'approve' }
  | { type: 'reject' }
  | { type: 'addSelection' }
  | { type: 'removeReference'; id: string }
  | { type: 'messageChanged'; message: string }
  | { type: 'send'; message: string }
  | { type: 'attachFiles' }
  | { type: 'pasteFile'; fileName: string; mimeType: string; base64: string }
  | { type: 'pasteText'; text: string; start: number; end: number }
  | { type: 'removeAttachment'; id: string }
  | { type: 'requestAttachment'; id: string }
  | { type: 'openAttachment'; id: string }
  | { type: 'openFile'; path: string; line?: number; endLine?: number }
  | { type: 'openInMaestri' }
  | { type: 'queryMentions'; query: string }
  | { type: 'markRead' }
  | { type: 'dismissNotice' };

const SIMPLE_TYPES = [
  'ready',
  'pickAgent',
  'enableChat',
  'loadOlder',
  'clearHistory',
  'approve',
  'reject',
  'addSelection',
  'attachFiles',
  'openInMaestri',
  'markRead',
  'dismissNotice',
] as const;

type SimpleType = (typeof SIMPLE_TYPES)[number];

const ID_TYPES = [
  'deleteEntry',
  'removeReference',
  'removeAttachment',
  'requestAttachment',
  'openAttachment',
] as const;

type IdType = (typeof ID_TYPES)[number];

export const MAX_PASTED_FILE_BYTES = 8 * 1024 * 1024;

export function parseChatFromWebview(raw: unknown): ChatFromWebview | undefined {
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    return undefined;
  }
  const type = raw.type;

  if (isSimpleType(type)) {
    return { type };
  }
  if (isIdType(type)) {
    return typeof raw.id === 'string' && raw.id !== '' ? { type, id: raw.id } : undefined;
  }

  switch (type) {
    case 'followAction':
      return raw.action === 'start' || raw.action === 'pause' || raw.action === 'resume' || raw.action === 'stop'
        ? { type, action: raw.action } : undefined;
    case 'selectThread':
    case 'clearThread':
      return isSlot(raw.slot) ? { type, slot: raw.slot } : undefined;
    case 'messageChanged':
    case 'send':
      return typeof raw.message === 'string' ? { type, message: raw.message } : undefined;
    case 'queryMentions':
      return typeof raw.query === 'string' ? { type, query: raw.query } : undefined;
    case 'pasteFile':
      return parsePasteFile(raw);
    case 'pasteText':
      return parsePasteText(raw);
    case 'openFile':
      return parseOpenFile(raw);
    default:
      return undefined;
  }
}

function parsePasteFile(raw: Record<string, unknown>): ChatFromWebview | undefined {
  const { fileName, mimeType, base64 } = raw;
  if (typeof fileName !== 'string' || fileName.trim() === '') {
    return undefined;
  }
  if (typeof mimeType !== 'string' || typeof base64 !== 'string' || base64 === '') {
    return undefined;
  }
  if ((base64.length * 3) / 4 > MAX_PASTED_FILE_BYTES + 3) {
    return undefined;
  }
  return { type: 'pasteFile', fileName, mimeType, base64 };
}

function parsePasteText(raw: Record<string, unknown>): ChatFromWebview | undefined {
  const { text, start, end } = raw;
  if (typeof text !== 'string' || text.trim() === '') {
    return undefined;
  }
  if (!isOffset(start) || !isOffset(end) || end < start) {
    return undefined;
  }
  return { type: 'pasteText', text, start, end };
}

function parseOpenFile(raw: Record<string, unknown>): ChatFromWebview | undefined {
  if (typeof raw.path !== 'string' || raw.path.trim() === '') {
    return undefined;
  }
  const result: { type: 'openFile'; path: string; line?: number; endLine?: number } = {
    type: 'openFile',
    path: raw.path,
  };
  if (isLine(raw.line)) {
    result.line = raw.line;
    if (isLine(raw.endLine) && raw.endLine >= raw.line) {
      result.endLine = raw.endLine;
    }
  }
  return result;
}

function isSimpleType(type: string): type is SimpleType {
  return (SIMPLE_TYPES as readonly string[]).includes(type);
}

function isIdType(type: string): type is IdType {
  return (ID_TYPES as readonly string[]).includes(type);
}

function isSlot(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;
}

function isOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isLine(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
