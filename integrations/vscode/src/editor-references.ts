import * as vscode from 'vscode';
import type { CodeReference } from '@maestri-bridge/core';
import { buildReferences, referencePath } from './references.ts';

export function collectReferences(editor: vscode.TextEditor): CodeReference[] {
  const document = editor.document;
  const selections = editor.selections.map((selection) => ({
    startLine: selection.start.line,
    startCharacter: selection.start.character,
    endLine: selection.end.line,
    endCharacter: selection.end.character,
    text: document.getText(selection),
  }));

  return buildReferences(
    { path: documentPath(document), languageId: document.languageId },
    selections,
  );
}

export function referencesForRange(
  document: vscode.TextDocument,
  range: vscode.Range,
): CodeReference[] {
  return buildReferences(
    { path: documentPath(document), languageId: document.languageId },
    [
      {
        startLine: range.start.line,
        startCharacter: range.start.character,
        endLine: range.end.line,
        endCharacter: range.end.character,
        text: document.getText(range),
      },
    ],
  );
}

function documentPath(document: vscode.TextDocument): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  return referencePath(document.uri.fsPath, workspaceFolder?.uri.fsPath);
}
