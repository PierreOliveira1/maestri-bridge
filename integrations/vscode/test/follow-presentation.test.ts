import { describe, expect, it } from 'vitest';
import { followAccent, followPresentation } from '../src/follow-presentation.ts';

describe('persistent follow indicator', () => {
  it('keeps the same theme accent for the same agent across updates', () => {
    expect(followAccent('agent1')).toEqual(followAccent('agent1'));
    expect(followAccent('agent1')).not.toEqual(followAccent('agent2'));
    expect(followAccent('agent1').themeColor).toMatch(/^charts\.(blue|purple|green|orange|red|yellow)$/);
  });
  it('always names the agent in active, paused and completed states', () => {
    for (const phase of ['following', 'paused', 'completed'] as const) {
      expect(followPresentation({ agentId: 'a', name: 'Senku', phase }).label).toContain('Senku');
    }
  });
  it('uses an explicit target and toggles pause/resume without changing the agent', () => {
    const active = followPresentation({ agentId: 'a', name: 'Senku', phase: 'following' });
    const paused = followPresentation({ agentId: 'a', name: 'Senku', phase: 'paused' });
    expect(active.icon).toBe('target');
    expect(active.badge).toBe('Acompanhando');
    expect(active.command).toBe('maestriBridge.follow.pause');
    expect(paused.icon).toBe('debug-pause');
    expect(paused.badge).toBe('Pausado');
    expect(paused.command).toBe('maestriBridge.follow.resume');
  });
});
