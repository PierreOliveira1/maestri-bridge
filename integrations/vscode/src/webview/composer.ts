import { canSend, sendLabel } from '../composer-protocol.ts';
import type {
  ComposerNotice,
  ComposerReferenceView,
  ComposerState,
  ComposerTargetView,
  FromWebview,
  ToWebview,
} from '../composer-protocol.ts';
import { setLocale, t } from '../i18n/index.ts';

interface WebviewApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): WebviewApi;

const vscode = acquireVsCodeApi();

let state: ComposerState = {
  references: [],
  message: storedMessage(vscode.getState()),
  sending: false,
  isMac: false,
  locale: 'en',
};
let lastExtensionMessage = '';
let previousSending = false;
let messageTimer: number | undefined;

const app = document.getElementById('app');
if (app === null) {
  throw new Error('Missing #app element.');
}

const agentButton = el('button', 'agent-button');
agentButton.type = 'button';
const agentText = el('span', 'agent-text');
const agentAction = el('span', 'agent-action');
agentButton.append(agentText, agentAction);
agentButton.addEventListener('click', () => {
  post({ type: 'pickAgent' });
});

const refsList = el('div', 'references');
const emptyRefs = el('p', 'empty-references');
const addSelectionButton = el('button', 'link-button');
addSelectionButton.type = 'button';
addSelectionButton.addEventListener('click', () => {
  post({ type: 'addSelection' });
});

const messageInput = el('textarea', 'message-input');
messageInput.addEventListener('input', onInput);
messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    send();
  }
});

const noticeBox = el('div', 'notice');
noticeBox.hidden = true;

const hint = el('span', 'footer-hint');
const sendButton = el('button', 'send-button');
sendButton.type = 'button';
sendButton.addEventListener('click', () => {
  send();
});

const footer = el('div', 'footer');
footer.append(hint, sendButton);

const targetLabel = el('div', 'section-label');
const targetSection = el('section', 'section');
targetSection.append(targetLabel, agentButton);

const referencesLabel = el('div', 'section-label');
const referencesSection = el('section', 'section');
referencesSection.append(referencesLabel, refsList, emptyRefs, addSelectionButton);

const messageLabel = el('div', 'section-label');
const messageSection = el('section', 'section');
messageSection.append(messageLabel, messageInput);

const composer = el('div', 'composer');
composer.append(targetSection, referencesSection, messageSection, noticeBox, footer);
app.append(composer);

messageInput.value = state.message;
autoGrow();
renderLabels();
renderTarget(undefined);
renderReferences([]);
updateSendButton();

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const data = event.data;
  if (typeof data !== 'object' || data === null) {
    return;
  }
  const message = data as ToWebview;
  if (message.type === 'state') {
    render(message.state);
  } else if (message.type === 'focusMessage') {
    messageInput.focus();
  }
});

post({ type: 'ready' });

function render(next: ComposerState): void {
  setLocale(next.locale);
  document.documentElement.lang = next.locale;
  renderLabels();

  const focused = document.activeElement === messageInput;
  const succeeded = previousSending && !next.sending && next.notice?.kind === 'success';

  if (succeeded) {
    lastExtensionMessage = next.message;
    setMessage(next.message);
  } else if (next.message !== lastExtensionMessage) {
    lastExtensionMessage = next.message;
    if (!focused) {
      setMessage(next.message);
    }
  }

  previousSending = next.sending;
  state = next;

  renderTarget(next.target);
  renderReferences(next.references);
  renderNotice(next.notice);
  const shortcut = next.isMac ? '⌘' : 'Ctrl';
  messageInput.placeholder = t('panel.message.placeholder', { shortcut });
  hint.textContent = t('panel.footer.hint', { shortcut });
  updateSendButton();
}

function renderTarget(target: ComposerTargetView | undefined): void {
  agentText.replaceChildren();

  if (target === undefined) {
    agentText.append(el('span', 'agent-empty', t('panel.target.empty')));
    agentAction.textContent = '';
    return;
  }

  agentText.append(el('span', 'agent-name', target.terminalName));
  const meta =
    target.floorText === undefined
      ? target.workspaceName
      : `${target.workspaceName} · ${target.floorText}`;
  agentText.append(el('span', 'agent-meta', meta));
  agentAction.textContent = t('panel.target.change');
}

function renderReferences(references: ComposerReferenceView[]): void {
  refsList.replaceChildren();
  emptyRefs.hidden = references.length > 0;
  for (const reference of references) {
    refsList.append(referenceCard(reference));
  }
}

function referenceCard(reference: ComposerReferenceView): HTMLElement {
  const card = el('div', 'ref-card');
  const header = el('div', 'ref-header');
  header.append(el('span', 'ref-title', reference.header));

  const remove = el('button', 'ref-remove', '✕');
  remove.type = 'button';
  remove.setAttribute('aria-label', t('panel.references.remove'));
  remove.title = t('panel.references.remove');
  remove.addEventListener('click', () => {
    post({ type: 'removeReference', id: reference.id });
  });
  header.append(remove);
  card.append(header);

  if (reference.text !== undefined && reference.text.trim() !== '') {
    const body = el('div', 'ref-body');
    const text = reference.text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    const startLine = reference.startLine ?? 1;
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      const row = el('div', 'code-line');
      row.append(
        el('span', 'line-number', String(startLine + index)),
        el('span', 'line-text', line),
      );
      body.append(row);
    });
    card.append(body);
  }

  return card;
}

function renderNotice(notice: ComposerNotice | undefined): void {
  noticeBox.replaceChildren();
  noticeBox.className = 'notice';

  if (notice === undefined) {
    noticeBox.hidden = true;
    return;
  }

  noticeBox.hidden = false;
  noticeBox.classList.add(notice.kind === 'success' ? 'notice-success' : 'notice-error');
  noticeBox.append(el('span', 'notice-text', notice.text));

  const actions = el('span', 'notice-actions');
  if (notice.canOpenInMaestri) {
    const open = el('button', 'link-button', t('general.openInMaestri'));
    open.type = 'button';
    open.addEventListener('click', () => {
      post({ type: 'openInMaestri' });
    });
    actions.append(open);
  }

  const dismiss = el('button', 'notice-dismiss', '✕');
  dismiss.type = 'button';
  dismiss.setAttribute('aria-label', t('panel.notice.dismiss'));
  dismiss.addEventListener('click', () => {
    post({ type: 'dismissNotice' });
  });
  actions.append(dismiss);
  noticeBox.append(actions);
}

function updateSendButton(): void {
  sendButton.textContent = sendLabel(state);
  sendButton.disabled = !canSend({
    message: messageInput.value,
    references: state.references,
    sending: state.sending,
  });
}

function setMessage(value: string): void {
  messageInput.value = value;
  vscode.setState({ message: value });
  autoGrow();
  updateSendButton();
}

function onInput(): void {
  const value = messageInput.value;
  vscode.setState({ message: value });
  autoGrow();
  updateSendButton();

  if (messageTimer !== undefined) {
    window.clearTimeout(messageTimer);
  }
  messageTimer = window.setTimeout(() => {
    messageTimer = undefined;
    post({ type: 'messageChanged', message: messageInput.value });
  }, 300);
}

function send(): void {
  if (
    !canSend({
      message: messageInput.value,
      references: state.references,
      sending: state.sending,
    })
  ) {
    return;
  }
  post({ type: 'send', message: messageInput.value });
}

function autoGrow(): void {
  messageInput.style.height = 'auto';
  const height = Math.min(400, Math.max(140, messageInput.scrollHeight));
  messageInput.style.height = `${height}px`;
  messageInput.style.overflowY = messageInput.scrollHeight > 400 ? 'auto' : 'hidden';
}

function post(message: FromWebview): void {
  vscode.postMessage(message);
}

function renderLabels(): void {
  targetLabel.textContent = t('panel.section.target');
  referencesLabel.textContent = t('panel.section.references');
  messageLabel.textContent = t('panel.section.message');
  emptyRefs.textContent = t('panel.references.empty');
  addSelectionButton.textContent = t('panel.references.add');
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

function storedMessage(value: unknown): string {
  if (typeof value !== 'object' || value === null) {
    return '';
  }
  const message = (value as Record<string, unknown>).message;
  return typeof message === 'string' ? message : '';
}
