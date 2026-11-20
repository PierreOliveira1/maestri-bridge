import type { FollowBannerView } from '../chat-protocol.ts';

export function createFollowBanner(send: (action: 'start' | 'pause' | 'resume' | 'stop') => void): {
  element: HTMLElement;
  update: (startLabel: string, view?: FollowBannerView) => void;
} {
  const element = document.createElement('section');
  element.className = 'follow-banner';
  element.hidden = true;
  const header = document.createElement('div');
  header.className = 'follow-banner-header';
  const icon = document.createElement('span');
  icon.className = 'follow-banner-icon';
  icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('strong');
  label.setAttribute('role', 'status');
  const context = document.createElement('span');
  context.className = 'follow-banner-context';
  const file = document.createElement('code');
  file.className = 'follow-banner-file';
  const note = document.createElement('div');
  note.className = 'follow-banner-note';
  note.setAttribute('aria-live', 'polite');
  const actions = document.createElement('div');
  actions.className = 'follow-banner-actions';
  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'follow-banner-start';
  const startIcon = document.createElement('span');
  startIcon.setAttribute('aria-hidden', 'true');
  startIcon.textContent = '◎';
  const startText = document.createElement('span');
  start.append(startIcon, startText);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  const stop = document.createElement('button');
  stop.type = 'button';
  let current: FollowBannerView | undefined;
  let signature = '';
  let noteSignature = '';
  start.addEventListener('click', () => send('start'));
  toggle.addEventListener('click', () => {
    if (current?.phase === 'paused') send('resume');
    else if (current?.phase === 'following') send('pause');
  });
  stop.addEventListener('click', () => send('stop'));
  actions.append(start, toggle, stop);
  header.append(icon, label);
  element.append(header, context, file, actions, note);
  return {
    element,
    update(startLabel, view) {
      const next = JSON.stringify([startLabel, view]);
      if (next === signature) return;
      signature = next;
      current = view;
      element.hidden = false;
      header.hidden = !view;
      element.dataset.accent = view?.accent ?? 'blue';
      element.dataset.phase = view?.phase ?? 'idle';
      header.title = view?.tooltip ?? '';
      label.textContent = view?.label ?? '';
      icon.textContent = view?.phase === 'paused' ? 'Ⅱ' : view?.phase === 'completed' ? '✓' : '◎';
      context.textContent = view?.context ?? '';
      context.hidden = !view?.context;
      file.textContent = view?.file ?? '';
      file.hidden = !view?.file;
      startText.textContent = startLabel;
      toggle.hidden = !view || view.phase === 'completed';
      toggle.textContent = view?.toggleLabel ?? '';
      stop.hidden = !view;
      stop.textContent = view?.stopLabel ?? '';
      const nextNote = JSON.stringify(view?.note ?? view?.waitingLabel ?? '');
      if (nextNote === noteSignature) return;
      noteSignature = nextNote;
      note.hidden = !view?.note && !view?.waitingLabel;
      if (!view?.note) {
        note.textContent = view?.waitingLabel ?? '';
        return;
      }
      const caption = document.createElement('strong');
      caption.textContent = view.note.label;
      const location = document.createElement('code');
      location.textContent = view.note.location;
      const text = document.createElement('p');
      text.textContent = view.note.message;
      text.tabIndex = 0;
      note.replaceChildren(caption, location, text);
    },
  };
}
