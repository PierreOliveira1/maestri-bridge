import { relative, sep } from 'node:path';
import type { CodeReference } from '@maestri-bridge/core';

export interface SelectionRange {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  text: string;
}

export interface DocumentInfo {
  path: string;
  languageId: string;
}

export function buildReferences(
  document: DocumentInfo,
  selections: readonly SelectionRange[],
): CodeReference[] {
  const references: CodeReference[] = [];

  for (const selection of selections) {
    if (selection.text.trim() === '') {
      continue;
    }

    const startLine = selection.startLine + 1;
    const endLine =
      selection.endCharacter === 0 && selection.endLine > selection.startLine
        ? selection.endLine
        : selection.endLine + 1;

    references.push({
      path: document.path,
      startLine,
      endLine,
      language: document.languageId,
      text: selection.text,
    });
  }

  references.sort((a, b) => (a.startLine ?? 0) - (b.startLine ?? 0));

  if (references.length === 0) {
    return [{ path: document.path, language: document.languageId }];
  }

  return references;
}

export function referencePath(
  fileFsPath: string,
  workspaceFolderFsPath: string | undefined,
): string {
  if (workspaceFolderFsPath === undefined) {
    return fileFsPath;
  }

  const relativePath = relative(workspaceFolderFsPath, fileFsPath);
  if (relativePath.startsWith('..')) {
    return fileFsPath;
  }

  return sep === '/' ? relativePath : relativePath.split(sep).join('/');
}
