const BORDER_PREFIX = /^[\s│┃║╹╻▌▐|]+/u;
const BORDER_SUFFIX = /[\s│┃║╹╻▌▐|]+$/u;
const HAS_CONTENT = /[\p{L}\p{N}]/u;

const CHROME_PATTERNS: readonly RegExp[] = [
  /\bctrl\+[a-z]\b/i,
  /\besc to (interrupt|cancel)\b/i,
  /\d+(\.\d+)?\s*tok\/s\b/i,
  /\d+(\.\d+)?K? \(\d+%\)/,
  /\btokens?\)\s*$/i,
  /^⎿?\s*Tip:/,
  /^(Build|Plan) · .+ · (max|high|medium|low|minimal)$/,
  /^Ask anything…/,
  /^\/update to install\b/,
  /^v?\d+\.\d+\.\d+$/,
];

export function compactPreviewLine(line: string): string {
  return line.replace(BORDER_PREFIX, '').replace(BORDER_SUFFIX, '').replace(/\s+/g, ' ').trim();
}

export function isPreviewChrome(line: string): boolean {
  if (!HAS_CONTENT.test(line)) {
    return true;
  }
  return CHROME_PATTERNS.some((pattern) => pattern.test(line));
}

export function meaningfulPreview(preview: readonly string[]): string[] {
  const lines: string[] = [];
  for (const raw of preview) {
    const line = compactPreviewLine(raw);
    if (line !== '' && !isPreviewChrome(line)) {
      lines.push(line);
    }
  }
  return lines;
}
