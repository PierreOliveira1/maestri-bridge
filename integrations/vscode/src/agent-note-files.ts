import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import type { StopLocation } from './notes-tour.ts';
import type { SavedNoteStop } from './note-tour-state.ts';
import { resolveWorkspaceFile } from './workspace-files.ts';

export function rangeForNote(
  document: vscode.TextDocument,
  location: StopLocation,
): vscode.Range {
  const lastLine = Math.max(0, document.lineCount - 1);
  const first = Math.min(lastLine, Math.max(0, (location.startLine ?? 1) - 1));
  const last = Math.min(
    lastLine,
    Math.max(first, (location.endLine ?? location.startLine ?? 1) - 1),
  );
  return new vscode.Range(first, 0, last, document.lineAt(last).text.length);
}

export function noteAnchor(document: vscode.TextDocument, range: vscode.Range): string {
  return createHash('sha256').update(document.getText(range)).digest('hex');
}

export async function resolveSavedNoteStops(stops: readonly SavedNoteStop[]): Promise<{
  index: number;
  note: SavedNoteStop;
  document: vscode.TextDocument;
  range: vscode.Range;
}[]> {
  const documents: { index: number; note: SavedNoteStop; document: vscode.TextDocument }[] = [];
  for (const [index, note] of stops.entries()) {
    const result = await resolveWorkspaceFile(note.file);
    if (result.kind !== 'found') {
      continue;
    }
    try {
      const document = await vscode.workspace.openTextDocument(result.uri);
      documents.push({ index, note, document });
    } catch {
      continue;
    }
  }

  return documents
    .filter(({ document }) => vscode.workspace.getWorkspaceFolder(document.uri) !== undefined)
    .map((entry) => ({ ...entry, range: rangeForNote(entry.document, entry.note) }))
    .filter(({ document, range, note }) => noteAnchor(document, range) === note.anchor);
}
