export const SHOW_LINK_PATH = '/show';
export const BRIDGE_EXTENSION_ID = 'maestri-bridge.maestri-bridge';
export const MAX_SHOW_TEXT = 8000;
export const MAX_SHOW_FILE = 4096;
export const MAX_SHOW_NAME = 64;

const MAX_SHOW_LINE = 10000000;
const AGENT_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const LINES_PATTERN = /^(\d+)(?:\s*-\s*(\d+))?$/;

export interface ShowRequest {
  file: string;
  startLine?: number;
  endLine?: number;
  text?: string;
  agentId?: string;
  from?: string;
  newTour: boolean;
}

export type ShowLinkErrorCode =
  | 'missingFile'
  | 'fileTooLong'
  | 'invalidLines'
  | 'textTooLong'
  | 'invalidAgent'
  | 'nameTooLong';

export type ShowLinkResult =
  | { ok: true; request: ShowRequest }
  | { ok: false; error: ShowLinkErrorCode };

export function parseShowLink(query: string): ShowLinkResult {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);

  const fileParam = params.get('file');
  const file = fileParam === null ? '' : fileParam.trim();
  if (file === '') {
    return { ok: false, error: 'missingFile' };
  }
  if (file.length > MAX_SHOW_FILE) {
    return { ok: false, error: 'fileTooLong' };
  }

  const request: ShowRequest = { file, newTour: parseNewTour(params.get('new')) };

  const linesParam = params.get('lines');
  const lines = linesParam === null ? '' : linesParam.trim();
  if (lines !== '') {
    const match = LINES_PATTERN.exec(lines);
    if (match === null) {
      return { ok: false, error: 'invalidLines' };
    }
    const startLine = Number(match[1]);
    const endLine = match[2] === undefined ? startLine : Number(match[2]);
    if (
      !Number.isInteger(startLine) ||
      !Number.isInteger(endLine) ||
      startLine < 1 ||
      endLine < 1 ||
      startLine > MAX_SHOW_LINE ||
      endLine > MAX_SHOW_LINE ||
      endLine < startLine
    ) {
      return { ok: false, error: 'invalidLines' };
    }
    request.startLine = startLine;
    request.endLine = endLine;
  }

  const textParam = params.get('text');
  if (textParam !== null) {
    const text = textParam.replace(/\r\n?/g, '\n').trim();
    if (text.length > MAX_SHOW_TEXT) {
      return { ok: false, error: 'textTooLong' };
    }
    if (text !== '') {
      request.text = text;
    }
  }

  const agentParam = params.get('agent');
  if (agentParam !== null) {
    const agentId = agentParam.trim();
    if (agentId !== '') {
      if (!AGENT_ID_PATTERN.test(agentId)) {
        return { ok: false, error: 'invalidAgent' };
      }
      request.agentId = agentId;
    }
  }

  const fromParam = params.get('from');
  if (fromParam !== null) {
    const from = fromParam.replace(/\p{Cc}/gu, '').replace(/\s+/g, ' ').trim();
    if (from.length > MAX_SHOW_NAME) {
      return { ok: false, error: 'nameTooLong' };
    }
    if (from !== '') {
      request.from = from;
    }
  }

  return { ok: true, request };
}

export function buildShowLink(request: ShowRequest, scheme = 'vscode'): string {
  const params = new URLSearchParams();
  params.set('file', request.file);

  const lines = showLines(request.startLine, request.endLine);
  if (lines !== undefined) {
    params.set('lines', lines);
  }
  if (request.text !== undefined) {
    params.set('text', request.text);
  }
  if (request.agentId !== undefined) {
    params.set('agent', request.agentId);
  }
  if (request.from !== undefined) {
    params.set('from', request.from);
  }
  if (request.newTour) {
    params.set('new', '1');
  }

  return `${scheme}://${BRIDGE_EXTENSION_ID}${SHOW_LINK_PATH}?${params.toString()}`;
}

function parseNewTour(value: string | null): boolean {
  if (value === null) {
    return false;
  }
  const normalized = value.toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function showLines(startLine: number | undefined, endLine: number | undefined): string | undefined {
  if (startLine === undefined) {
    return undefined;
  }
  if (endLine === undefined || endLine === startLine) {
    return String(startLine);
  }
  return `${startLine}-${endLine}`;
}
