export interface CodeReference {
  path: string;
  startLine?: number;
  endLine?: number;
  language?: string;
  text?: string;
}

const LANGUAGE_TAGS: Record<string, string> = {
  typescriptreact: 'tsx',
  javascriptreact: 'jsx',
  shellscript: 'bash',
  plaintext: '',
};

export function fenceLanguage(languageId: string | undefined): string {
  if (languageId === undefined) {
    return '';
  }
  const lower = languageId.toLowerCase();
  return LANGUAGE_TAGS[lower] ?? lower;
}

export function formatReferenceHeader(ref: CodeReference): string {
  const language = fenceLanguage(ref.language);
  const suffix = language === '' ? '' : ` (${language})`;
  if (ref.startLine === undefined) {
    return ref.path + suffix;
  }
  if (ref.endLine === undefined || ref.endLine === ref.startLine) {
    return `${ref.path}:${ref.startLine}${suffix}`;
  }
  const first = Math.min(ref.startLine, ref.endLine);
  const last = Math.max(ref.startLine, ref.endLine);
  return `${ref.path}:${first}-${last}${suffix}`;
}

export function fenceFor(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

export interface FormatPromptOptions {
  heading?: string;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

function referenceBlock(ref: CodeReference, heading: string): string {
  const header = `${heading}: ${formatReferenceHeader(ref)}`;
  if (ref.text === undefined) {
    return header;
  }
  const text = normalizeNewlines(ref.text).replace(/\n+$/, '');
  if (text.trim() === '') {
    return header;
  }
  const fence = fenceFor(text);
  const language = fenceLanguage(ref.language);
  return `${header}\n${fence}${language}\n${text}\n${fence}`;
}

export function formatPrompt(
  message: string,
  references: readonly CodeReference[],
  options?: FormatPromptOptions,
): string {
  const heading = options?.heading ?? 'Reference';
  const blocks = references.map((ref) => referenceBlock(ref, heading));
  return [normalizeNewlines(message).trim(), ...blocks].filter((part) => part !== '').join('\n\n');
}
