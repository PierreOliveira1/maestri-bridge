import { describe, expect, it } from 'vitest';
import { DoublePress } from '../src/double-press.ts';

function clock(times: number[]): () => number {
  let index = 0;
  return () => {
    const value = times[index];
    index += 1;
    if (value === undefined) {
      throw new Error('relógio sem valores');
    }
    return value;
  };
}

describe('DoublePress', () => {
  it('não conta o primeiro toque como duplo', () => {
    const detector = new DoublePress(600, clock([1000]));
    expect(detector.press()).toBe(false);
  });

  it('reconhece o segundo toque dentro da janela', () => {
    const detector = new DoublePress(600, clock([1000, 1500]));
    expect(detector.press()).toBe(false);
    expect(detector.press()).toBe(true);
  });

  it('aceita o segundo toque exatamente no limite da janela', () => {
    const detector = new DoublePress(600, clock([1000, 1600]));
    detector.press();
    expect(detector.press()).toBe(true);
  });

  it('ignora o segundo toque fora da janela e recomeça a contagem', () => {
    const detector = new DoublePress(600, clock([1000, 1700, 2000]));
    expect(detector.press()).toBe(false);
    expect(detector.press()).toBe(false);
    expect(detector.press()).toBe(true);
  });

  it('não emenda um terceiro toque logo após um duplo', () => {
    const detector = new DoublePress(600, clock([1000, 1200, 1400]));
    detector.press();
    expect(detector.press()).toBe(true);
    expect(detector.press()).toBe(false);
  });
});
