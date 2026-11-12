import { describe, expect, it } from 'vitest';
import {
  attentionInfo,
  countAttention,
  detectNewAttention,
  needsAttention,
  pendingPromptFor,
} from '../src/attention.ts';
import type { FeedSnapshot, TerminalSummary } from '../src/models.ts';

function terminal(id: string, overrides: Partial<TerminalSummary> = {}): TerminalSummary {
  return {
    id,
    nodeId: id,
    name: id,
    isRunning: true,
    needsAttention: false,
    isActive: false,
    isManager: false,
    preview: [],
    ...overrides,
  };
}

function snapshot(overrides: Partial<FeedSnapshot> = {}): FeedSnapshot {
  return {
    workspace: { id: 'ws', name: 'Workspace', isLoaded: true, isLocked: false },
    floors: [],
    terminals: [],
    pendingPrompts: [],
    ...overrides,
  };
}

describe('pendingPromptFor', () => {
  it('encontra o prompt pendente pelo id', () => {
    const feed = snapshot({
      pendingPrompts: [{ terminalId: 't1', prompt: 'Permitir?' }],
    });

    expect(pendingPromptFor(feed, 't1')).toBe('Permitir?');
    expect(pendingPromptFor(feed, 't2')).toBeUndefined();
  });
});

describe('needsAttention', () => {
  it('considera a flag e o prompt pendente', () => {
    expect(needsAttention(snapshot(), terminal('t1', { needsAttention: true }))).toBe(true);
    expect(
      needsAttention(
        snapshot({ pendingPrompts: [{ terminalId: 't2', prompt: 'S/n' }] }),
        terminal('t2'),
      ),
    ).toBe(true);
    expect(needsAttention(snapshot(), terminal('t3'))).toBe(false);
  });
});

describe('attentionInfo', () => {
  it('prioriza o prompt pendente', () => {
    const item = terminal('t1', {
      needsAttention: true,
      maestroRequest: { message: 'Maestro' },
      preview: ['linha'],
    });
    const feed = snapshot({
      pendingPrompts: [{ terminalId: 't1', prompt: 'Permitir rodar?' }],
    });

    expect(attentionInfo(feed, item)).toEqual({
      reason: 'Permitir rodar?',
      pendingPrompt: 'Permitir rodar?',
    });
  });

  it('usa a mensagem do maestro', () => {
    const item = terminal('t1', {
      maestroRequest: { message: 'Preciso de você' },
      preview: ['linha'],
    });

    expect(attentionInfo(snapshot(), item)).toEqual({ reason: 'Preciso de você' });
  });

  it('usa a última linha não vazia do preview com espaços colapsados', () => {
    const item = terminal('t1', {
      preview: ['antiga', '  status   final\tcom  espaços  ', '', '   '],
    });

    expect(attentionInfo(snapshot(), item)).toEqual({
      reason: 'status final com espaços',
    });
  });

  it('ignora a moldura do terminal', () => {
    const item = terminal('t1', {
      preview: ['Resposta final', '…/abc:main 19.7K (2%) · $0.01 ctrl+p commands'],
    });

    expect(attentionInfo(snapshot(), item)).toEqual({ reason: 'Resposta final' });
  });

  it('devolve motivo vazio quando não há nada', () => {
    expect(attentionInfo(snapshot(), terminal('t1'))).toEqual({
      reason: '',
    });
  });
});

describe('detectNewAttention', () => {
  it('não detecta nada sem snapshot anterior', () => {
    const next = snapshot({ terminals: [terminal('t1', { needsAttention: true })] });

    expect(detectNewAttention(undefined, next)).toEqual([]);
  });

  it('não detecta nada quando o workspace mudou', () => {
    const previous = snapshot({
      workspace: { id: 'w1', name: 'W1', isLoaded: true, isLocked: false },
    });
    const next = snapshot({
      workspace: { id: 'w2', name: 'W2', isLoaded: true, isLocked: false },
      terminals: [terminal('t1', { needsAttention: true })],
    });

    expect(detectNewAttention(previous, next)).toEqual([]);
  });

  it('detecta terminal novo pedindo atenção', () => {
    const item = terminal('t1', { needsAttention: true });
    const events = detectNewAttention(snapshot(), snapshot({ terminals: [item] }));

    expect(events).toEqual([
      { reason: '', terminal: item },
    ]);
  });

  it('detecta transição de false para true e ignora true sem mudança', () => {
    const previous = snapshot({ terminals: [terminal('t1')] });
    const next = snapshot({ terminals: [terminal('t1', { needsAttention: true })] });

    expect(detectNewAttention(previous, next)).toHaveLength(1);

    const unchanged = snapshot({
      terminals: [terminal('t1', { needsAttention: true })],
    });
    expect(detectNewAttention(next, unchanged)).toEqual([]);
  });

  it('detecta mudança no texto do prompt pendente', () => {
    const item = terminal('t1', { needsAttention: true });
    const previous = snapshot({
      terminals: [item],
      pendingPrompts: [{ terminalId: 't1', prompt: 'Permitir A?' }],
    });
    const next = snapshot({
      terminals: [item],
      pendingPrompts: [{ terminalId: 't1', prompt: 'Permitir B?' }],
    });

    expect(detectNewAttention(previous, next)).toEqual([
      { reason: 'Permitir B?', pendingPrompt: 'Permitir B?', terminal: item },
    ]);
  });

  it('detecta mudança na mensagem do maestro', () => {
    const previous = snapshot({
      terminals: [
        terminal('t1', {
          needsAttention: true,
          maestroRequest: { message: 'Antigo' },
        }),
      ],
    });
    const item = terminal('t1', {
      needsAttention: true,
      maestroRequest: { message: 'Novo' },
    });
    const next = snapshot({ terminals: [item] });

    expect(detectNewAttention(previous, next)).toEqual([
      { reason: 'Novo', terminal: item },
    ]);
  });

  it('mantém a ordem de next.terminals', () => {
    const first = terminal('b', { needsAttention: true });
    const second = terminal('a', { needsAttention: true });
    const events = detectNewAttention(
      snapshot(),
      snapshot({ terminals: [first, second] }),
    );

    expect(events.map((event) => event.terminal.id)).toEqual(['b', 'a']);
  });
});

describe('countAttention', () => {
  it('conta terminais que precisam de atenção', () => {
    const feed = snapshot({
      terminals: [
        terminal('t1', { needsAttention: true }),
        terminal('t2'),
        terminal('t3'),
      ],
      pendingPrompts: [{ terminalId: 't2', prompt: 'S/n' }],
    });

    expect(countAttention(feed)).toBe(2);
  });
});
