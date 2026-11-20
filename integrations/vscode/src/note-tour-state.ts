import type { StopLocation } from './notes-tour.ts';

interface SavedNoteComment {
  text: string;
  author: string;
  isReply: boolean;
}

export interface SavedNoteStop extends StopLocation {
  anchor: string;
  agentId?: string;
  name: string;
  viewed: boolean;
  comments: SavedNoteComment[];
}

export interface SavedNoteTour {
  version: 1;
  agentKey: string;
  currentIndex: number;
  stops: SavedNoteStop[];
}

export function readSavedNoteTour(value: unknown): SavedNoteTour | undefined {
  if (!isRecord(value) || value.version !== 1) {
    return undefined;
  }

  const { agentKey, currentIndex, stops } = value;
  if (
    typeof agentKey !== 'string' || agentKey.length === 0 ||
    typeof currentIndex !== 'number' || !Number.isSafeInteger(currentIndex) ||
    !Array.isArray(stops) || currentIndex < 0 || currentIndex >= stops.length ||
    !stops.every(isSavedNoteStop)
  ) {
    return undefined;
  }

  return { version: 1, agentKey, currentIndex, stops };
}

function isSavedNoteStop(value: unknown): value is SavedNoteStop {
  if (!isRecord(value)) {
    return false;
  }

  const { file, startLine, endLine, agentId, anchor, name, viewed, comments } = value;
  return (
    typeof file === 'string' && file.length > 0 &&
    (startLine === undefined || isLine(startLine)) &&
    (endLine === undefined || (isLine(startLine) && isLine(endLine) && endLine >= startLine)) &&
    (agentId === undefined || (typeof agentId === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(agentId))) &&
    typeof anchor === 'string' && /^[a-f0-9]{64}$/.test(anchor) &&
    typeof name === 'string' && name.length > 0 &&
    typeof viewed === 'boolean' &&
    Array.isArray(comments) && comments.length > 0 && comments.every(isSavedNoteComment)
  );
}

function isSavedNoteComment(value: unknown): value is SavedNoteComment {
  return (
    isRecord(value) &&
    typeof value.text === 'string' &&
    typeof value.author === 'string' &&
    typeof value.isReply === 'boolean'
  );
}

function isLine(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
