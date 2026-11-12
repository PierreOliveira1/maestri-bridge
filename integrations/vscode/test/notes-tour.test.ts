import { describe, expect, it } from 'vitest';
import { NoteTours } from '../src/notes-tour.ts';
import type { TourStop } from '../src/notes-tour.ts';

function createTours(idleMs = 100): { tours: NoteTours<string>; tick: (ms: number) => void } {
  let now = 0;
  const tours = new NoteTours<string>({ idleMs, now: () => now });
  return {
    tours,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

function stop(thread: string, startLine?: number, endLine?: number): TourStop<string> {
  const value: TourStop<string> = { file: 'src/app.ts', thread };
  if (startLine !== undefined) {
    value.startLine = startLine;
  }
  if (endLine !== undefined) {
    value.endLine = endLine;
  }
  return value;
}

describe('NoteTours', () => {
  it('começa um tour novo quando não existe tour', () => {
    const { tours } = createTours();
    expect(tours.begin('nina', false)).toEqual({ started: true, dropped: [] });
  });

  it('reaproveita o tour enquanto não expirou', () => {
    const { tours, tick } = createTours();
    tours.begin('nina', false);
    tours.push('nina', stop('a'));
    tick(100);
    expect(tours.begin('nina', false)).toEqual({ started: false, dropped: [] });
  });

  it('recomeça o tour expirado e devolve as threads antigas', () => {
    const { tours, tick } = createTours();
    tours.begin('nina', false);
    tours.push('nina', stop('a'));
    tours.push('nina', stop('b'));
    tick(101);
    expect(tours.begin('nina', false)).toEqual({ started: true, dropped: ['a', 'b'] });
    expect(tours.stops('nina')).toEqual([]);
  });

  it('recomeça forçado por newTour mesmo sem expirar', () => {
    const { tours } = createTours();
    tours.begin('nina', false);
    tours.push('nina', stop('a'));
    expect(tours.begin('nina', true)).toEqual({ started: true, dropped: ['a'] });
    expect(tours.stops('nina')).toEqual([]);
  });

  it('encontra a parada pelo arquivo e pelas linhas', () => {
    const { tours } = createTours();
    tours.begin('nina', false);
    tours.push('nina', stop('a', 12, 14));

    expect(tours.find('nina', { file: 'src/app.ts', startLine: 12, endLine: 14 })?.thread).toBe('a');
    expect(tours.find('nina', { file: 'src/app.ts', startLine: 12, endLine: 15 })).toBeUndefined();
    expect(tours.find('nina', { file: 'src/outro.ts', startLine: 12, endLine: 14 })).toBeUndefined();
    expect(tours.find('outro', { file: 'src/app.ts', startLine: 12, endLine: 14 })).toBeUndefined();
  });

  it('posiciona as threads no tour', () => {
    const { tours } = createTours();
    tours.begin('nina', false);
    tours.push('nina', stop('a'));
    tours.push('nina', stop('b'));

    expect(tours.position('a')).toEqual({ agentKey: 'nina', index: 0, total: 2 });
    expect(tours.position('b')).toEqual({ agentKey: 'nina', index: 1, total: 2 });
    expect(tours.position('c')).toBeUndefined();
  });

  it('navega em círculo nos dois sentidos', () => {
    const { tours } = createTours();
    tours.begin('nina', false);
    tours.push('nina', stop('a'));
    tours.push('nina', stop('b'));
    tours.push('nina', stop('c'));

    expect(tours.neighbor('a', 1)?.thread).toBe('b');
    expect(tours.neighbor('b', 1)?.thread).toBe('c');
    expect(tours.neighbor('c', 1)?.thread).toBe('a');
    expect(tours.neighbor('a', -1)?.thread).toBe('c');
    expect(tours.neighbor('c', -1)?.thread).toBe('b');
    expect(tours.neighbor('desconhecida', 1)).toBeUndefined();
  });

  it('acompanha o último agente tocado', () => {
    const { tours, tick } = createTours();
    tours.begin('nina', false);
    tours.push('nina', stop('a'));
    tick(10);
    tours.begin('bia', false);
    tours.push('bia', stop('b'));
    expect(tours.latestAgent()).toBe('bia');

    tick(10);
    tours.touch('nina');
    expect(tours.latestAgent()).toBe('nina');
  });

  it('remove uma parada e mantém o tour', () => {
    const { tours } = createTours();
    tours.begin('nina', false);
    tours.push('nina', stop('a'));
    tours.push('nina', stop('b'));

    expect(tours.remove('a')).toBe('nina');
    expect(tours.stops('nina').map((item) => item.thread)).toEqual(['b']);
    expect(tours.position('b')).toEqual({ agentKey: 'nina', index: 0, total: 1 });
    expect(tours.remove('desconhecida')).toBeUndefined();
  });

  it('apaga o tour quando a última parada sai', () => {
    const { tours } = createTours();
    tours.begin('nina', false);
    tours.push('nina', stop('a'));

    expect(tours.remove('a')).toBe('nina');
    expect(tours.stops('nina')).toEqual([]);
    expect(tours.latestAgent()).toBeUndefined();
  });

  it('esvazia todos os tours e devolve as threads', () => {
    const { tours } = createTours();
    tours.begin('nina', false);
    tours.push('nina', stop('a'));
    tours.begin('bia', false);
    tours.push('bia', stop('b'));

    expect(tours.clear()).toEqual(['a', 'b']);
    expect(tours.stops('nina')).toEqual([]);
    expect(tours.stops('bia')).toEqual([]);
    expect(tours.latestAgent()).toBeUndefined();
  });
});
