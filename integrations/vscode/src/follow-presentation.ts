import type { FollowSummary } from './follow-state.ts';
import { t } from './i18n/index.ts';

const accents = ['blue', 'purple', 'green', 'orange', 'red', 'yellow'] as const;

export function followAccent(agentId: string): { name: typeof accents[number]; themeColor: string } {
  let hash = 0;
  for (const char of agentId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const name = accents[hash % accents.length] ?? 'blue';
  return { name, themeColor: `charts.${name}` };
}

export function followPresentation(summary: FollowSummary): { label: string; badge: string; icon: string; command: string } {
  if (summary.phase === 'paused') {
    return { label: `${t('follow.pausedBadge')} · ${summary.name}`, badge: t('follow.pausedBadge'), icon: 'debug-pause', command: 'maestriBridge.follow.resume' };
  }
  if (summary.phase === 'completed') {
    return { label: t('follow.completed', { name: summary.name }), badge: t('follow.completedBadge'), icon: 'check', command: 'maestriBridge.follow.start' };
  }
  return { label: t('follow.active', { name: summary.name }), badge: t('follow.badge'), icon: 'target', command: 'maestriBridge.follow.pause' };
}
