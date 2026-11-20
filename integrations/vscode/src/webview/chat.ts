import MarkdownIt from 'markdown-it';
import { MAX_PASTED_FILE_BYTES } from '../chat-protocol.ts';
import type {
  ChatAttachmentView,
  ChatDraftAttachmentView,
  ChatEntryView,
  ChatFromWebview,
  ChatNotice,
  ChatReferenceView,
  ChatThreadView,
  ChatToWebview,
  ChatViewState,
  MentionKind,
  MentionView,
} from '../chat-protocol.ts';
import { setLocale, t } from '../i18n/index.ts';
import {
  displayMentionTokens,
  findMentionTrigger,
  serializeMentions,
} from './chat-mention-tokens.ts';
import type { InsertedMention, MentionTriggerChar } from './chat-mention-tokens.ts';
import { findFileReferences } from './chat-links.ts';
import { createFollowBanner } from './follow-banner.ts';

interface WebviewApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

interface MenuItem {
  label: string;
  action(): void;
}

interface CachedEntry {
  signature: string;
  element: HTMLElement;
}

declare function acquireVsCodeApi(): WebviewApi;

const vscode = acquireVsCodeApi();
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true });
const attachmentData = new Map<string, string>();
const requestedAttachments = new Set<string>();
const entryElements = new Map<string, CachedEntry>();

let state: ChatViewState | undefined;
let previousState: ChatViewState | undefined;
let previousSending = false;
let lastExtensionMessage = '';
let lastMarkReadAt = 0;
let localNoticeTimer: number | undefined;
let messageTimer: number | undefined;
let mentionTimer: number | undefined;
let mentionContextStart: number | undefined;
let mentionTrigger: MentionTriggerChar | undefined;
let mentionQuery = '';
let mentionItems: MentionView[] = [];
let mentionDisplayItems: MentionView[] = [];
let mentionActiveIndex = 0;
let mentionResponseQuery: string | undefined;
let insertedMentions: InsertedMention[] = [];
let compactStatus = false;
let isOwner = false;

const THREAD_COLORS: Record<string, string> = {
  blue: '#0A84FF',
  purple: '#BF5AF2',
  pink: '#FF375F',
  red: '#FF453A',
  orange: '#FF9F0A',
  yellow: '#FFD60A',
  green: '#30D158',
  graphite: '#8E8E93',
};

const app = document.getElementById('app');
if (app === null) {
  throw new Error('Missing #app element.');
}

const root = el('div', 'chat-root');
const followBanner = createFollowBanner((action) => post({ type: 'followAction', action }));
const header = el('header', 'chat-header');
const headerRow = el('div', 'header-row');

const agentButton = el('button', 'agent-button');
agentButton.type = 'button';
const agentText = el('div', 'agent-text');
const agentArrow = el('span', 'agent-arrow', '▾');
agentButton.append(agentText);

const openButton = iconButton('↗', t('chat.header.openInMaestri'));
const moreWrap = el('div', 'more-wrap');
const moreButton = iconButton('⋯', t('chat.header.more'));
moreButton.setAttribute('aria-haspopup', 'menu');
moreButton.setAttribute('aria-expanded', 'false');
moreWrap.append(moreButton);

headerRow.append(agentButton, openButton, moreWrap);

const threadRow = el('div', 'thread-row');
const threadsBox = el('div', 'threads');
const statusBox = el('div', 'status');
threadRow.append(threadsBox, statusBox);
header.append(headerRow, threadRow);

const banners = el('div', 'banners');

const scrollArea = el('div', 'scroll-area');
const messages = el('div', 'messages');
const loadOlderButton = el('button', 'load-older');
loadOlderButton.type = 'button';
loadOlderButton.hidden = true;
const entriesBox = el('div', 'entries');
const emptyState = el('div', 'empty-state');
emptyState.hidden = true;
const workingIndicator = el('div', 'working-indicator');
workingIndicator.hidden = true;
const workingDots = el('span', 'working-dots');
workingDots.append(
  el('span', 'working-dot'),
  el('span', 'working-dot'),
  el('span', 'working-dot'),
);
const workingText = el('span', 'working-text');
workingIndicator.append(workingDots, workingText);
messages.append(loadOlderButton, entriesBox, emptyState, workingIndicator);
const newMessagesButton = el('button', 'new-messages');
newMessagesButton.type = 'button';
newMessagesButton.hidden = true;
scrollArea.append(messages, newMessagesButton);

const composer = el('div', 'composer');
const draftChips = el('div', 'draft-chips');
draftChips.hidden = true;
const localNotice = el('div', 'local-notice');
localNotice.hidden = true;
const inputWrap = el('div', 'composer-input-wrap');
const mentionPopup = el('div', 'mention-popup');
mentionPopup.hidden = true;
const messageInput = el('textarea', 'message-input');
messageInput.rows = 1;
messageInput.value = storedDraft(vscode.getState());
inputWrap.append(mentionPopup, messageInput);

const composerButtons = el('div', 'composer-buttons');
const composerActions = el('div', 'composer-actions');
const addSelectionButton = el('button', 'link-button');
addSelectionButton.type = 'button';
const attachButton = iconButton('📎', t('chat.composer.attach'));
composerActions.append(addSelectionButton, attachButton);
const sendButton = el('button', 'send-button');
sendButton.type = 'button';
composerButtons.append(composerActions, sendButton);
composer.append(draftChips, localNotice, inputWrap, composerButtons);

const floatingMenu = el('div', 'floating-menu');
floatingMenu.hidden = true;
floatingMenu.setAttribute('role', 'menu');
document.body.append(floatingMenu);

root.append(followBanner.element, header, banners, scrollArea, composer);
app.append(root);

compactStatus = root.clientWidth < 360;
statusBox.classList.toggle('status-compact', compactStatus);
const statusObserver = new ResizeObserver((entries) => {
  const width = entries[0]?.contentRect.width ?? root.clientWidth;
  compactStatus = width < 360;
  statusBox.classList.toggle('status-compact', compactStatus);
});
statusObserver.observe(root);

agentButton.addEventListener('click', () => {
  post({ type: 'pickAgent' });
});
openButton.addEventListener('click', () => {
  post({ type: 'openInMaestri' });
});
moreButton.addEventListener('click', (event) => {
  event.stopPropagation();
  openMoreMenu();
});
loadOlderButton.addEventListener('click', () => {
  post({ type: 'loadOlder' });
});
newMessagesButton.addEventListener('click', () => {
  scrollToBottom();
  hideNewMessages();
  markRead();
});
let pinnedToBottom = true;
const messagesObserver = new ResizeObserver(() => {
  if (pinnedToBottom) {
    scrollToBottom();
  }
});
messagesObserver.observe(messages);
messages.addEventListener('scroll', () => {
  pinnedToBottom = isNearBottom();
  if (pinnedToBottom) {
    hideNewMessages();
    if (document.visibilityState !== 'hidden') {
      markRead();
    }
  }
});
window.addEventListener('focus', () => {
  markRead();
});
window.addEventListener('resize', () => {
  autoGrow();
});
messageInput.addEventListener('input', onInput);
messageInput.addEventListener('keydown', onMessageKeyDown);
messageInput.addEventListener('paste', onPaste);
composer.addEventListener('dragover', (event) => {
  event.preventDefault();
});
composer.addEventListener('drop', onDrop);
addSelectionButton.addEventListener('click', () => {
  post({ type: 'addSelection' });
});
attachButton.addEventListener('click', () => {
  post({ type: 'attachFiles' });
});
sendButton.addEventListener('click', () => {
  send();
});
document.addEventListener('click', (event) => {
  if (!floatingMenu.contains(event.target as Node)) {
    hideFloatingMenu();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideFloatingMenu();
  }
});

autoGrow();
renderComposer();
updateSendButton();

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const data = event.data;
  if (!isRecord(data) || typeof data.type !== 'string') {
    return;
  }
  const message = data as ChatToWebview;
  switch (message.type) {
    case 'followState':
      followBanner.update(message.startLabel, message.follow);
      break;
    case 'state':
      renderState(message.state);
      break;
    case 'focusMessage':
      messageInput.focus();
      break;
    case 'attachmentData':
      applyAttachmentData(message.id, message.dataUri);
      break;
    case 'mentions':
      if (message.query === mentionQuery && mentionContextStart !== undefined) {
        mentionItems = message.items;
        mentionResponseQuery = message.query;
        mentionActiveIndex = 0;
        renderMentionPopup();
      }
      break;
    case 'pastedAsReference':
      applyPastedReference(message.start, message.end, message.text);
      break;
  }
});

post({ type: 'ready' });

function renderState(next: ChatViewState): void {
  setLocale(next.locale);
  document.documentElement.lang = next.locale;
  document.title = t('chat.panel.title');
  newMessagesButton.textContent = `↓ ${t('chat.entry.newMessages')}`;
  newMessagesButton.setAttribute('aria-label', t('chat.entry.newMessages'));

  const scrollHeightBefore = messages.scrollHeight;
  const scrollTopBefore = messages.scrollTop;
  const wasNearBottom = previousState === undefined || pinnedToBottom;
  const wasLoadingOlder = previousState?.loadingOlder ?? false;
  const previousLastId = previousState?.entries[previousState.entries.length - 1]?.id;
  const nextLastId = next.entries[next.entries.length - 1]?.id;
  const entriesChanged =
    previousState === undefined ||
    previousState.entries.length !== next.entries.length ||
    previousLastId !== nextLastId;
  const focused = document.activeElement === messageInput;

  syncComposer(next, focused);
  state = next;
  isOwner = next.isOwner;

  renderHeader(next);
  renderThreads(next);
  renderStatus(next);
  renderBanners(next);
  renderMessages(next);
  renderComposer();
  renderWorking(next);
  if (mentionContextStart !== undefined) {
    renderMentionPopup();
  }
  autoGrow();
  updateSendButton();

  previousState = next;
  previousSending = next.composer.sending;

  if (wasLoadingOlder && !next.loadingOlder) {
    messages.scrollTop = scrollTopBefore + (messages.scrollHeight - scrollHeightBefore);
    hideNewMessages();
  } else if (wasNearBottom) {
    scrollToBottom();
    hideNewMessages();
  } else if (entriesChanged && next.entries.length > 0) {
    newMessagesButton.hidden = false;
  }
}

function syncComposer(next: ChatViewState, focused: boolean): void {
  const succeeded = previousSending && !next.composer.sending && next.composer.message === '';
  if (succeeded) {
    clearMessageTimer();
    insertedMentions = [];
    lastExtensionMessage = '';
    setMessage('');
    return;
  }
  if (next.composer.message !== lastExtensionMessage) {
    lastExtensionMessage = next.composer.message;
    if (!focused) {
      setMessage(next.composer.message);
    }
  }
}

function renderHeader(next: ChatViewState): void {
  agentText.replaceChildren();
  if (next.target === undefined) {
    const row = el('span', 'agent-name-row');
    row.append(el('span', 'agent-empty', t('chat.header.pickAgent')), agentArrow);
    agentText.append(row);
    agentButton.title = t('chat.header.pickAgent');
    agentButton.setAttribute('aria-label', t('chat.header.pickAgent'));
    return;
  }

  const row = el('span', 'agent-name-row');
  row.append(el('span', 'agent-name', next.target.terminalName), agentArrow);
  agentText.append(row);
  const meta =
    next.target.floorText === undefined
      ? next.target.workspaceName
      : `${next.target.workspaceName} · ${next.target.floorText}`;
  agentText.append(el('span', 'agent-meta', meta));
  agentButton.title = t('chat.header.changeAgent');
  agentButton.setAttribute('aria-label', t('chat.header.changeAgent'));
}

function renderThreads(next: ChatViewState): void {
  threadsBox.replaceChildren();
  threadsBox.hidden = next.threads === undefined;
  if (next.threads === undefined) {
    return;
  }

  for (const thread of next.threads.items) {
    threadsBox.append(threadButton(next, thread));
  }
}

function threadButton(next: ChatViewState, thread: ChatThreadView): HTMLButtonElement {
  const threads = next.threads;
  const button = el('button', 'thread-button');
  button.type = 'button';
  const dot = el('span', 'thread-dot');
  dot.style.setProperty('--thread-color', colorHex(thread.color));
  dot.classList.toggle('has-messages', thread.hasMessages);
  dot.classList.toggle('active', thread.active);
  button.append(dot);
  button.setAttribute('aria-pressed', thread.active ? 'true' : 'false');

  const color = colorLabel(thread.color);
  const disabled = threads === undefined || !threads.canSelect;
  button.disabled = disabled;
  const title = disabled
    ? t('chat.thread.locked')
    : t(thread.hasMessages ? 'chat.thread.select' : 'chat.thread.empty', { color });
  button.title = title;
  button.setAttribute('aria-label', title);

  button.addEventListener('click', () => {
    if (!disabled) {
      post({ type: 'selectThread', slot: thread.slot });
    }
  });
  button.addEventListener('contextmenu', (event) => {
    if (!isOwner || !thread.hasMessages) {
      return;
    }
    event.preventDefault();
    openFloatingMenu(event.clientX, event.clientY, [
      {
        label: t('chat.header.clearThread', { color }),
        action: () => {
          post({ type: 'clearThread', slot: thread.slot });
        },
      },
    ]);
  });
  return button;
}

function renderStatus(next: ChatViewState): void {
  statusBox.replaceChildren();
  statusBox.className = 'status';
  statusBox.classList.toggle('status-compact', compactStatus);
  const text = statusText(next);
  if (text === '') {
    statusBox.removeAttribute('title');
    statusBox.removeAttribute('aria-label');
    return;
  }
  const dot = el('span', 'status-dot');
  dot.setAttribute('aria-hidden', 'true');
  statusBox.append(dot, el('span', 'status-text', text));
  statusBox.classList.add(`status-${statusClass(next.status)}`);
  statusBox.title = text;
  statusBox.setAttribute('aria-label', text);
}

function statusText(next: ChatViewState): string {
  if (next.talkingToAgentName !== undefined) {
    return t('chat.status.talkingTo', { name: next.talkingToAgentName });
  }
  if (next.answeringAgentName !== undefined) {
    return t('chat.status.answering', { name: next.answeringAgentName });
  }
  if (next.turnInterrupted) {
    return t('chat.status.interrupted');
  }
  switch (next.status) {
    case 'working':
      return t('chat.status.working');
    case 'needsAttention':
      return t('chat.status.needsAttention');
    case 'idle':
      return t('chat.status.idle');
    case 'notRunning':
      return t('chat.status.notRunning');
    case 'unloaded':
      return t('chat.status.unloaded');
    default:
      return next.status ?? '';
  }
}

function statusClass(status: string | undefined): string {
  switch (status) {
    case 'working':
    case 'needsAttention':
    case 'idle':
    case 'notRunning':
    case 'unloaded':
      return status;
    default:
      return 'unknown';
  }
}

function renderBanners(next: ChatViewState): void {
  banners.replaceChildren();

  switch (next.connection) {
    case 'unpaired':
      banners.append(
        banner('connection', t('chat.connection.unpaired'), t('chat.connection.pair'), () => {
          post({ type: 'pickAgent' });
        }),
      );
      break;
    case 'offline':
      banners.append(
        banner('connection', t('chat.connection.offline'), t('chat.connection.retry'), () => {
          post({ type: 'ready' });
        }),
      );
      break;
    case 'polling':
      banners.append(banner('connection subtle', t('chat.connection.polling')));
      break;
    case 'connecting':
      banners.append(banner('connection subtle', t('chat.connection.connecting')));
      break;
  }

  if (!next.chatEnabled && next.target !== undefined) {
    banners.append(
      banner(
        'disabled',
        t('chat.disabled.text', { name: next.target.terminalName }),
        t('chat.disabled.enable'),
        () => {
          post({ type: 'enableChat' });
        },
      ),
    );
  }

  if (next.pendingPrompt !== undefined) {
    banners.append(attentionCard(next.pendingPrompt, next.target?.terminalName ?? ''));
  }

  if (next.notice !== undefined) {
    banners.append(noticeBanner(next.notice));
  }
}

function banner(
  kind: string,
  text: string,
  actionLabel?: string,
  action?: () => void,
): HTMLElement {
  const element = el('div', `banner banner-${kind}`);
  const label = el('span', 'banner-text', text);
  label.title = text;
  element.append(label);
  if (actionLabel !== undefined && action !== undefined) {
    const button = el('button', 'banner-button', actionLabel);
    button.type = 'button';
    button.addEventListener('click', action);
    element.append(button);
  }
  return element;
}

function attentionCard(prompt: string, name: string): HTMLElement {
  const card = el('div', 'attention-card');
  card.append(el('div', 'attention-title', t('chat.attention.title', { name })));
  const text = el('pre', 'attention-prompt', prompt);
  card.append(text);
  const actions = el('div', 'attention-actions');
  const approve = el('button', 'primary-button', t('chat.attention.approve'));
  approve.type = 'button';
  approve.addEventListener('click', () => {
    post({ type: 'approve' });
  });
  const reject = el('button', 'secondary-button', t('chat.attention.reject'));
  reject.type = 'button';
  reject.addEventListener('click', () => {
    post({ type: 'reject' });
  });
  actions.append(approve, reject);
  card.append(actions);
  return card;
}

function noticeBanner(notice: ChatNotice): HTMLElement {
  const element = el('div', `banner notice notice-${notice.kind}`);
  element.append(el('span', 'banner-text', notice.text));
  const dismiss = el('button', 'icon-button', '×');
  dismiss.type = 'button';
  dismiss.title = t('chat.notice.dismiss');
  dismiss.setAttribute('aria-label', t('chat.notice.dismiss'));
  dismiss.addEventListener('click', () => {
    post({ type: 'dismissNotice' });
  });
  element.append(dismiss);
  return element;
}

function renderMessages(next: ChatViewState): void {
  loadOlderButton.hidden = !next.hasOlder;
  loadOlderButton.disabled = next.loadingOlder;
  loadOlderButton.textContent = next.loadingOlder
    ? t('chat.history.loading')
    : t('chat.history.loadOlder');

  const seen = new Set<string>();
  for (let index = 0; index < next.entries.length; index += 1) {
    const entry = next.entries[index];
    if (entry === undefined) {
      continue;
    }
    seen.add(entry.id);
    const previous = index === 0 ? undefined : next.entries[index - 1];
    const label = entryLabel(next, entry, previous);
    const signature = entrySignature(entry, label);
    const cached = entryElements.get(entry.id);
    let element: HTMLElement;
    if (cached !== undefined && cached.signature === signature) {
      element = cached.element;
    } else {
      element = renderEntry(next, entry, label);
      entryElements.set(entry.id, { signature, element });
    }
    entriesBox.append(element);
  }

  for (const [id, cached] of entryElements) {
    if (!seen.has(id)) {
      cached.element.remove();
      entryElements.delete(id);
    }
  }

  renderEmpty(next);
}

function entrySignature(entry: ChatEntryView, label: string | undefined): string {
  const attachments = entry.attachments.map((attachment) => `${attachment.id}:${attachment.isImage}`);
  return [
    state?.locale ?? '',
    entry.kind,
    entry.role,
    entry.text,
    entry.pending === true ? 'pending' : '',
    attachments.join(','),
    isOwner ? 'owner' : 'guest',
    label ?? '',
  ].join('|');
}

function entryLabel(
  next: ChatViewState,
  entry: ChatEntryView,
  previous: ChatEntryView | undefined,
): string | undefined {
  if (entry.role !== 'agent' || (entry.kind !== 'message' && entry.kind !== 'final')) {
    return undefined;
  }

  const targetName = next.target?.terminalName ?? '';
  const author = entry.authorName ?? targetName;
  if (previous !== undefined && previous.role === 'agent') {
    const previousAuthor = previous.authorName ?? targetName;
    if (previousAuthor === author && withinFiveMinutes(previous.ts, entry.ts)) {
      return undefined;
    }
  }

  const time = formatTime(entry.ts);
  if (time === '') {
    return author;
  }
  return author === '' ? time : `${author} · ${time}`;
}

function renderEntry(
  next: ChatViewState,
  entry: ChatEntryView,
  label: string | undefined,
): HTMLElement {
  const element = el('div', `entry entry-${entry.role} entry-${entry.kind}`);
  if (entry.pending === true) {
    element.classList.add('entry-pending');
  }

  if (entry.kind === 'divider') {
    const divider = el('div', 'divider');
    const text = displayMentionTokens(entry.text, mentionActionLabel);
    if (text !== '') {
      divider.append(el('span', 'divider-text', text));
    }
    element.append(divider);
    element.append(entryActions(entry));
    return element;
  }

  if (entry.kind === 'progress') {
    const progressText = el(
      'span',
      'progress-text',
      displayMentionTokens(entry.text, mentionActionLabel),
    );
    linkifyFileReferences(progressText);
    element.append(progressText);
    element.append(entryActions(entry));
    return element;
  }

  if (entry.role === 'agent' && label !== undefined) {
    element.append(el('div', 'entry-label', label));
  }

  const content = el('div', 'markdown');
  content.innerHTML = markdown.render(displayMentionTokens(entry.text, mentionActionLabel));
  linkifyFileReferences(content);
  addCodeCopyButtons(content);

  if (entry.role === 'user') {
    const bubble = el('div', 'bubble');
    bubble.append(content);
    renderAttachments(next, entry, bubble);
    if (entry.pending === true) {
      bubble.append(el('div', 'sending-label', t('chat.entry.sending')));
    }
    element.append(bubble);
  } else {
    element.append(content);
    renderAttachments(next, entry, element);
  }

  element.append(entryActions(entry));
  return element;
}

function renderAttachments(
  next: ChatViewState,
  entry: ChatEntryView,
  container: HTMLElement,
): void {
  if (entry.attachments.length === 0) {
    return;
  }

  const attachments = el('div', 'entry-attachments');
  for (const attachment of entry.attachments) {
    if (attachment.isImage) {
      attachments.append(imageAttachment(attachment));
    } else {
      attachments.append(fileAttachment(attachment));
    }
  }
  container.append(attachments);
}

function imageAttachment(attachment: ChatAttachmentView): HTMLButtonElement {
  const button = el('button', 'attachment-image');
  button.type = 'button';
  button.dataset.attachmentId = attachment.id;
  button.dataset.attachmentName = attachment.filename;
  button.title = t('chat.attachment.open', { name: attachment.filename });
  button.setAttribute('aria-label', t('chat.attachment.open', { name: attachment.filename }));
  button.addEventListener('click', () => {
    post({ type: 'openAttachment', id: attachment.id });
  });

  const dataUri = attachmentData.get(attachment.id);
  if (dataUri !== undefined) {
    button.append(attachmentImg(attachment, dataUri));
  } else {
    const placeholder = el('span', 'attachment-placeholder');
    placeholder.dataset.attachmentPlaceholder = attachment.id;
    button.append(placeholder);
    requestAttachment(attachment.id);
  }
  return button;
}

function fileAttachment(attachment: ChatAttachmentView): HTMLButtonElement {
  const button = el('button', 'attachment-chip', `📎 ${attachment.filename}`);
  button.type = 'button';
  button.title = t('chat.attachment.open', { name: attachment.filename });
  button.addEventListener('click', () => {
    post({ type: 'openAttachment', id: attachment.id });
  });
  return button;
}

function attachmentImg(attachment: ChatAttachmentView, dataUri: string): HTMLImageElement {
  const image = el('img', 'attachment-image-content');
  image.src = dataUri;
  image.alt = attachment.filename;
  return image;
}

function requestAttachment(id: string): void {
  if (requestedAttachments.has(id)) {
    return;
  }
  requestedAttachments.add(id);
  post({ type: 'requestAttachment', id });
}

function applyAttachmentData(id: string, dataUri: string): void {
  const nearBottom = isNearBottom();
  attachmentData.set(id, dataUri);
  for (const button of document.querySelectorAll<HTMLButtonElement>('button.attachment-image')) {
    if (button.dataset.attachmentId !== id) {
      continue;
    }
    const filename = button.dataset.attachmentName ?? '';
    button.replaceChildren(
      attachmentImg({ id, filename, isImage: true }, dataUri),
    );
  }
  if (nearBottom) {
    scrollToBottom();
  }
}

function entryActions(entry: ChatEntryView): HTMLElement {
  const actions = el('div', 'entry-actions');
  const copy = el('button', 'icon-button entry-action', '⧉');
  copy.type = 'button';
  copy.title = t('chat.entry.copy');
  copy.setAttribute('aria-label', t('chat.entry.copy'));
  copy.addEventListener('click', () => {
    void copyText(entry.text);
    copy.textContent = '✓';
    copy.title = t('chat.entry.copied');
    window.setTimeout(() => {
      copy.textContent = '⧉';
      copy.title = t('chat.entry.copy');
    }, 1500);
  });
  actions.append(copy);

  if (isOwner && entry.pending !== true) {
    const remove = el('button', 'icon-button entry-action', '✕');
    remove.type = 'button';
    remove.title = t('chat.entry.delete');
    remove.setAttribute('aria-label', t('chat.entry.delete'));
    remove.addEventListener('click', () => {
      post({ type: 'deleteEntry', id: entry.id });
    });
    actions.append(remove);
  }
  return actions;
}

function renderWorking(next: ChatViewState): void {
  const last = next.entries[next.entries.length - 1];
  const visible = next.status === 'working' && last?.kind !== 'progress';
  workingIndicator.hidden = !visible;
  if (visible) {
    workingText.textContent = t('chat.entry.working', {
      name: next.target?.terminalName ?? '',
    });
  }
}

function renderEmpty(next: ChatViewState): void {
  emptyState.replaceChildren();
  if (next.entries.length > 0) {
    emptyState.hidden = true;
    return;
  }

  emptyState.hidden = false;
  if (next.target === undefined) {
    emptyState.append(el('p', 'empty-text', t('chat.empty.noTarget')));
    const button = el('button', 'primary-button', t('chat.header.pickAgent'));
    button.type = 'button';
    button.addEventListener('click', () => {
      post({ type: 'pickAgent' });
    });
    emptyState.append(button);
    return;
  }
  emptyState.append(el('p', 'empty-text', t('chat.empty.noMessages')));
}

function renderComposer(): void {
  const current = state;
  if (current === undefined) {
    updateSendButton();
    return;
  }

  draftChips.replaceChildren();
  for (const reference of current.composer.references) {
    draftChips.append(referenceChip(reference));
  }
  for (const attachment of current.composer.attachments) {
    draftChips.append(draftAttachmentChip(attachment));
  }
  draftChips.hidden =
    current.composer.references.length === 0 && current.composer.attachments.length === 0;

  const shortcut = current.isMac ? '⌘' : 'Ctrl';
  messageInput.placeholder =
    current.target === undefined
      ? t('chat.composer.placeholderNoTarget')
      : t('chat.composer.placeholder', {
          name: current.target.terminalName,
          shortcut,
        });
  addSelectionButton.textContent = `+ ${t('chat.composer.addSelection')}`;
  attachButton.title = t('chat.composer.attach');
  attachButton.setAttribute('aria-label', t('chat.composer.attach'));
  sendButton.textContent = current.composer.sending
    ? t('chat.composer.sending')
    : t('chat.composer.send');
  updateSendButton();
}

function referenceChip(reference: ChatReferenceView): HTMLElement {
  const chip = el('span', 'draft-chip');
  const text = el('span', 'draft-chip-text', reference.header);
  chip.append(text);
  if (reference.text !== undefined) {
    text.title = firstLines(reference.text, 12);
  }
  const remove = el('button', 'chip-remove', '×');
  remove.type = 'button';
  remove.title = t('chat.composer.removeReference');
  remove.setAttribute('aria-label', t('chat.composer.removeReference'));
  remove.addEventListener('click', () => {
    post({ type: 'removeReference', id: reference.id });
  });
  chip.append(remove);
  return chip;
}

function draftAttachmentChip(attachment: ChatDraftAttachmentView): HTMLElement {
  const chip = el('span', 'draft-chip draft-attachment');
  if (attachment.uploading) {
    chip.classList.add('uploading');
    chip.title = t('chat.attachment.uploading', { name: attachment.fileName });
  }
  if (attachment.failed) {
    chip.classList.add('failed');
    chip.title = t('chat.attachment.failed', { name: attachment.fileName });
  }
  const icon = el(
    'span',
    attachment.isImage ? 'draft-thumb' : 'draft-file',
    attachment.isImage ? '🖼' : '📎',
  );
  chip.append(icon, el('span', 'draft-chip-text', attachment.fileName));
  if (attachment.uploading) {
    chip.append(el('span', 'upload-spinner'));
  }
  const remove = el('button', 'chip-remove', '×');
  remove.type = 'button';
  remove.title = t('chat.attachment.remove', { name: attachment.fileName });
  remove.setAttribute('aria-label', t('chat.attachment.remove', { name: attachment.fileName }));
  remove.addEventListener('click', () => {
    post({ type: 'removeAttachment', id: attachment.id });
  });
  chip.append(remove);
  return chip;
}

function updateSendButton(): void {
  const current = state;
  sendButton.disabled =
    current === undefined ||
    current.target === undefined ||
    current.composer.sending ||
    !hasSendableContent(current);
}

function hasSendableContent(current: ChatViewState): boolean {
  if (messageInput.value.trim() !== '') {
    return true;
  }
  if (current.composer.references.length > 0) {
    return true;
  }
  return current.composer.attachments.some(
    (attachment) => !attachment.uploading && !attachment.failed,
  );
}

function onInput(): void {
  autoGrow();
  pruneInsertedMentions();
  updateSendButton();
  vscode.setState({ message: messageInput.value });
  updateMentionState();
  scheduleMessageChanged();
}

function scheduleMessageChanged(): void {
  clearMessageTimer();
  messageTimer = window.setTimeout(() => {
    messageTimer = undefined;
    post({ type: 'messageChanged', message: messageInput.value });
  }, 300);
}

function onMessageKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    send();
    return;
  }

  if (mentionContextStart !== undefined && mentionDisplayItems.length > 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      mentionActiveIndex = (mentionActiveIndex + 1) % mentionDisplayItems.length;
      renderMentionPopup();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      mentionActiveIndex =
        (mentionActiveIndex - 1 + mentionDisplayItems.length) % mentionDisplayItems.length;
      renderMentionPopup();
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const item = mentionDisplayItems[mentionActiveIndex];
      if (item !== undefined) {
        event.preventDefault();
        insertMention(item);
        return;
      }
    }
  }

  if (event.key === 'Escape') {
    closeMentions();
  }
}

function send(): void {
  const current = state;
  if (
    current === undefined ||
    current.target === undefined ||
    current.composer.sending ||
    !hasSendableContent(current)
  ) {
    return;
  }
  clearMessageTimer();
  pruneInsertedMentions();
  post({
    type: 'send',
    message: serializeMentions(messageInput.value, insertedMentions),
  });
}

function applyPastedReference(start: number, end: number, text: string): void {
  if (messageInput.value.slice(start, end) !== text) {
    return;
  }
  messageInput.value = `${messageInput.value.slice(0, start)}${messageInput.value.slice(end)}`;
  messageInput.selectionStart = start;
  messageInput.selectionEnd = start;
  onInput();
}

function setMessage(value: string): void {
  messageInput.value = value;
  vscode.setState({ message: value });
  pruneInsertedMentions();
  autoGrow();
  updateSendButton();
}

function pruneInsertedMentions(): void {
  const value = messageInput.value;
  if (value.trim() === '') {
    insertedMentions = [];
    return;
  }
  insertedMentions = insertedMentions.filter((mention) =>
    hasMentionBoundary(value, mention.text),
  );
}

function hasMentionBoundary(value: string, text: string): boolean {
  if (text === '') {
    return false;
  }
  let index = value.indexOf(text);
  while (index !== -1) {
    const next = value.charAt(index + text.length);
    if (next === '' || !/[\p{L}\p{N}]/u.test(next)) {
      return true;
    }
    index = value.indexOf(text, index + 1);
  }
  return false;
}

function autoGrow(): void {
  messageInput.style.height = 'auto';
  const styles = window.getComputedStyle(messageInput);
  const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
  const padding =
    (Number.parseFloat(styles.paddingTop) || 0) +
    (Number.parseFloat(styles.paddingBottom) || 0);
  const borders =
    (Number.parseFloat(styles.borderTopWidth) || 0) +
    (Number.parseFloat(styles.borderBottomWidth) || 0);
  const minHeight = lineHeight + padding + borders;
  const maxHeight = lineHeight * 10 + padding + borders;
  const contentHeight = messageInput.scrollHeight + borders;
  const height = Math.min(maxHeight, Math.max(minHeight, contentHeight));
  messageInput.style.height = `${height}px`;
  messageInput.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
}

function clearMessageTimer(): void {
  if (messageTimer !== undefined) {
    window.clearTimeout(messageTimer);
    messageTimer = undefined;
  }
}

function onPaste(event: ClipboardEvent): void {
  const clipboard = event.clipboardData;
  const files = clipboard?.files;
  if (files !== undefined && files.length > 0) {
    handleFiles(files);
    return;
  }

  const text = clipboard?.getData('text/plain') ?? '';
  if (!text.includes('\n') && !text.includes('\r')) {
    return;
  }

  const start = messageInput.selectionStart ?? 0;
  const length = text.replace(/\r\n?/g, '\n').length;
  window.setTimeout(() => {
    const inserted = messageInput.value.slice(start, start + length);
    post({ type: 'pasteText', text: inserted, start, end: start + length });
  }, 0);
}

function onDrop(event: DragEvent): void {
  const files = event.dataTransfer?.files;
  if (files === undefined || files.length === 0) {
    return;
  }
  event.preventDefault();
  handleFiles(files);
}

function handleFiles(files: FileList): void {
  for (const file of Array.from(files)) {
    if (file.size > MAX_PASTED_FILE_BYTES) {
      showLocalNotice(t('chat.attachment.tooLarge', { name: file.name }));
      continue;
    }
    readFileBase64(file)
      .then((base64) => {
        post({
          type: 'pasteFile',
          fileName: file.name,
          mimeType: file.type === '' ? 'application/octet-stream' : file.type,
          base64,
        });
      })
      .catch(() => {
        showLocalNotice(t('chat.attachment.failed', { name: file.name }));
      });
  }
}

async function readFileBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Invalid file result.'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Could not read file.'));
    };
    reader.readAsDataURL(file);
  });
}

function showLocalNotice(text: string): void {
  localNotice.textContent = text;
  localNotice.hidden = false;
  if (localNoticeTimer !== undefined) {
    window.clearTimeout(localNoticeTimer);
  }
  localNoticeTimer = window.setTimeout(() => {
    localNoticeTimer = undefined;
    localNotice.hidden = true;
  }, 5000);
}

function updateMentionState(): void {
  const match = findMentionTrigger(
    messageInput.value,
    messageInput.selectionStart ?? messageInput.value.length,
  );
  if (match === undefined) {
    closeMentions();
    return;
  }

  if (
    mentionContextStart !== match.start ||
    mentionQuery !== match.query ||
    mentionTrigger !== match.trigger
  ) {
    mentionContextStart = match.start;
    mentionTrigger = match.trigger;
    mentionQuery = match.query;
    mentionResponseQuery = undefined;
    mentionActiveIndex = 0;
    scheduleMentions();
  }
  mentionPopup.hidden = false;
  renderMentionPopup();
}

function scheduleMentions(): void {
  if (mentionTimer !== undefined) {
    window.clearTimeout(mentionTimer);
  }
  mentionTimer = window.setTimeout(() => {
    mentionTimer = undefined;
    if (mentionContextStart !== undefined) {
      post({ type: 'queryMentions', query: mentionQuery });
    }
  }, 150);
}

function closeMentions(): void {
  if (mentionTimer !== undefined) {
    window.clearTimeout(mentionTimer);
    mentionTimer = undefined;
  }
  mentionContextStart = undefined;
  mentionTrigger = undefined;
  mentionQuery = '';
  mentionResponseQuery = undefined;
  mentionItems = [];
  mentionDisplayItems = [];
  mentionActiveIndex = 0;
  mentionPopup.hidden = true;
  mentionPopup.replaceChildren();
}

function mentionSectionLabel(section: string): string {
  switch (section) {
    case 'maestro':
      return t('chat.mention.maestro');
    case 'terminals':
      return t('chat.mentions.section.terminals');
    case 'floors':
      return t('chat.mentions.section.floors');
    case 'notes':
      return t('chat.mentions.section.notes');
    case 'portals':
      return t('chat.mentions.section.portals');
    case 'actions':
      return t('chat.mentions.section.actions');
    case 'prompts':
      return t('chat.mentions.section.prompts');
    case 'files':
      return t('chat.mentions.files');
    default:
      return section.charAt(0).toUpperCase() + section.slice(1);
  }
}

function renderMentionPopup(): void {
  if (mentionContextStart === undefined) {
    mentionPopup.hidden = true;
    return;
  }
  mentionPopup.hidden = false;
  mentionPopup.replaceChildren();

  const visibleItems =
    mentionTrigger === '$'
      ? mentionItems.filter((item) => item.kind === 'prompt')
      : mentionItems;

  if (visibleItems.length === 0) {
    mentionDisplayItems = [];
    mentionActiveIndex = 0;
    if (mentionResponseQuery === mentionQuery) {
      mentionPopup.append(el('div', 'mention-empty', t('chat.mentions.empty')));
    } else {
      mentionPopup.hidden = true;
    }
    return;
  }

  mentionDisplayItems = [...visibleItems];
  if (mentionActiveIndex >= mentionDisplayItems.length) {
    mentionActiveIndex = mentionDisplayItems.length - 1;
  }

  let previousSection: string | undefined;
  let index = 0;
  for (const item of mentionDisplayItems) {
    if (item.section !== undefined && item.section !== previousSection) {
      mentionPopup.append(el('div', 'mention-header', mentionSectionLabel(item.section)));
    }
    previousSection = item.section;

    const itemIndex = index;
    const button = el('button', 'mention-item');
    button.type = 'button';
    const icon = el('span', 'mention-icon', mentionIcon(item.kind));
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon, el('span', 'mention-label', item.label));
    if (item.detail !== undefined) {
      const detail = el('span', 'mention-detail', item.detail);
      detail.title = item.detail;
      button.append(detail);
    }
    if (itemIndex === mentionActiveIndex) {
      button.classList.add('active');
    }
    button.addEventListener('mouseenter', () => {
      mentionActiveIndex = itemIndex;
      highlightMentions();
    });
    button.addEventListener('click', () => {
      insertMention(item);
    });
    mentionPopup.append(button);
    index += 1;
  }
  highlightMentions();
}

function mentionIcon(kind: MentionKind): string {
  switch (kind) {
    case 'agent':
      return '👤';
    case 'floor':
      return '▤';
    case 'note':
      return '📝';
    case 'portal':
      return '🌐';
    case 'action':
      return '⚡';
    case 'prompt':
      return '📋';
    case 'file':
      return '📄';
    default:
      return '•';
  }
}

function mentionActionLabel(kind: string): string | undefined {
  switch (kind) {
    case 'maestro':
      return t('chat.mention.maestro');
    case 'createNote':
      return t('chat.mention.createNote');
    case 'createPortal':
      return t('chat.mention.createPortal');
    case 'createDevicePortal':
      return t('chat.mention.createDevicePortal');
    case 'createFloor':
      return t('chat.mention.createFloor');
    case 'notifications':
      return t('chat.mention.notifications');
    case 'routines':
      return t('chat.mention.routines');
    case 'workspaces':
      return t('chat.mention.workspaces');
    case 'computerUse':
      return t('chat.mention.computerUse');
    default:
      return undefined;
  }
}

function highlightMentions(): void {
  const buttons = mentionPopup.querySelectorAll<HTMLButtonElement>('.mention-item');
  buttons.forEach((button, index) => {
    const active = index === mentionActiveIndex;
    button.classList.toggle('active', active);
    if (active) {
      button.scrollIntoView({ block: 'nearest' });
    }
  });
}

function insertMention(item: MentionView): void {
  if (mentionContextStart === undefined) {
    return;
  }
  if (item.token !== undefined && item.token !== '') {
    const mention: InsertedMention = { text: item.insertText, token: item.token };
    const existing = insertedMentions.findIndex((entry) => entry.text === mention.text);
    if (existing === -1) {
      insertedMentions.push(mention);
    } else {
      insertedMentions[existing] = mention;
    }
  }

  const caret = messageInput.selectionStart ?? messageInput.value.length;
  const before = messageInput.value.slice(0, mentionContextStart);
  const after = messageInput.value.slice(caret);
  const inserted = `${item.insertText}${item.kind === 'prompt' ? '' : ' '}`;
  messageInput.value = `${before}${inserted}${after}`;
  const position = before.length + inserted.length;
  messageInput.setSelectionRange(position, position);
  closeMentions();
  messageInput.focus();
  onInput();
  if (item.kind === 'prompt') {
    closeMentions();
  }
}

function linkifyFileReferences(rootElement: HTMLElement): void {
  const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current !== null) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const node of nodes) {
    const parent = node.parentElement;
    if (parent === null || parent.closest('pre, a') !== null) {
      continue;
    }
    const text = node.data;
    const references = findFileReferences(text);
    if (references.length === 0) {
      continue;
    }

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const reference of references) {
      if (reference.start > cursor) {
        fragment.append(document.createTextNode(text.slice(cursor, reference.start)));
      }
      const link = el('a', 'file-link', text.slice(reference.start, reference.end));
      link.href = '#';
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const message: { type: 'openFile'; path: string; line?: number; endLine?: number } = {
          type: 'openFile',
          path: reference.path,
        };
        if (reference.line !== undefined) {
          message.line = reference.line;
          if (reference.endLine !== undefined) {
            message.endLine = reference.endLine;
          }
        }
        post(message);
      });
      fragment.append(link);
      cursor = reference.end;
    }
    if (cursor < text.length) {
      fragment.append(document.createTextNode(text.slice(cursor)));
    }
    node.replaceWith(fragment);
  }
}

function addCodeCopyButtons(rootElement: HTMLElement): void {
  const blocks = Array.from(rootElement.querySelectorAll('pre'));
  for (const pre of blocks) {
    const parent = pre.parentElement;
    if (parent !== null && parent.classList.contains('code-block')) {
      continue;
    }
    const wrapper = el('div', 'code-block');
    pre.replaceWith(wrapper);
    wrapper.append(pre);
    const button = el('button', 'code-copy', t('chat.code.copy'));
    button.type = 'button';
    button.setAttribute('aria-label', t('chat.code.copy'));
    button.addEventListener('click', () => {
      void copyText(pre.textContent ?? '');
      button.textContent = t('chat.entry.copied');
      window.setTimeout(() => {
        button.textContent = t('chat.code.copy');
      }, 1500);
    });
    wrapper.append(button);
  }
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return;
  }
}

function openMoreMenu(): void {
  const current = state;
  if (current === undefined) {
    return;
  }
  const items: MenuItem[] = [];
  if (current.isOwner && current.canClear) {
    items.push({
      label: t('chat.header.clearHistory'),
      action: () => {
        post({ type: 'clearHistory' });
      },
    });
  }
  if (items.length === 0) {
    return;
  }
  const rect = moreButton.getBoundingClientRect();
  openFloatingMenu(rect.right - 190, rect.bottom + 4, items);
}

function openFloatingMenu(x: number, y: number, items: readonly MenuItem[]): void {
  floatingMenu.replaceChildren();
  for (const item of items) {
    const button = el('button', 'menu-item', item.label);
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.addEventListener('click', () => {
      hideFloatingMenu();
      item.action();
    });
    floatingMenu.append(button);
  }
  floatingMenu.hidden = false;
  moreButton.setAttribute('aria-expanded', 'true');
  const height = items.length * 32 + 8;
  const left = Math.max(4, Math.min(x, window.innerWidth - 190));
  const top = Math.max(4, Math.min(y, window.innerHeight - height - 4));
  floatingMenu.style.left = `${left}px`;
  floatingMenu.style.top = `${top}px`;
}

function hideFloatingMenu(): void {
  floatingMenu.hidden = true;
  moreButton.setAttribute('aria-expanded', 'false');
}

function markRead(): void {
  const now = Date.now();
  if (now - lastMarkReadAt < 2000) {
    return;
  }
  lastMarkReadAt = now;
  post({ type: 'markRead' });
}

function isNearBottom(): boolean {
  return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 48;
}

function scrollToBottom(): void {
  messages.scrollTop = messages.scrollHeight;
}

function hideNewMessages(): void {
  newMessagesButton.hidden = true;
}

function withinFiveMinutes(first: string, second: string): boolean {
  const firstTime = Date.parse(first);
  const secondTime = Date.parse(second);
  if (Number.isNaN(firstTime) || Number.isNaN(secondTime)) {
    return false;
  }
  return Math.abs(secondTime - firstTime) <= 5 * 60 * 1000;
}

function formatTime(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function firstLines(text: string, count: number): string {
  return text.replace(/\r\n?/g, '\n').split('\n').slice(0, count).join('\n');
}

function colorHex(color: string): string {
  return THREAD_COLORS[color] ?? color;
}

function colorLabel(color: string): string {
  switch (color) {
    case 'blue':
      return t('chat.color.blue');
    case 'purple':
      return t('chat.color.purple');
    case 'pink':
      return t('chat.color.pink');
    case 'red':
      return t('chat.color.red');
    case 'orange':
      return t('chat.color.orange');
    case 'yellow':
      return t('chat.color.yellow');
    case 'green':
      return t('chat.color.green');
    case 'graphite':
      return t('chat.color.graphite');
    default:
      return color;
  }
}

function storedDraft(value: unknown): string {
  if (!isRecord(value)) {
    return '';
  }
  return typeof value.message === 'string' ? value.message : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function iconButton(label: string, ariaLabel: string): HTMLButtonElement {
  const button = el('button', 'icon-button', label);
  button.type = 'button';
  button.title = ariaLabel;
  button.setAttribute('aria-label', ariaLabel);
  return button;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className !== undefined) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function post(message: ChatFromWebview): void {
  vscode.postMessage(message);
}
