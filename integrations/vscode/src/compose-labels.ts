import type { CodeReference } from '@maestri-bridge/core';
import { t } from './i18n/index.ts';
import { summarizeReferences } from './send-items.ts';

export function threadLabel(
  references: readonly CodeReference[],
  agentName: string | undefined,
): string {
  const header =
    references.length === 0 ? t('compose.labels.currentFile') : summarizeReferences(references);
  if (agentName !== undefined) {
    return t('compose.thread.label', { header, agent: agentName });
  }
  return t('compose.thread.labelNoAgent', { header });
}

export function fullLineRange(
  line: number,
  lineLength: number,
): { startLine: number; startCharacter: number; endLine: number; endCharacter: number } {
  return { startLine: line, startCharacter: 0, endLine: line, endCharacter: lineLength };
}
