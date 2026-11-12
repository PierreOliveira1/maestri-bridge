import type { notes as source } from '../en/notes.ts';

export const notes: Record<keyof typeof source, string> = {
  'notes.added': '{name} hat eine Notiz hinzugefügt ({index} von {total}). Nutze die Pfeile an der Notiz, um durch sie zu navigieren.',
  'notes.author.agent': 'Agent',
  'notes.author.you': 'Du',
  'notes.empty': 'Keine Agentennotizen zum Durchgehen.',
  'notes.error.agentNotFound': '{name} wurde in Maestri nicht mehr gefunden.',
  'notes.error.disabled':
    'Ein Agent hat versucht, hier Code zu öffnen, aber Agentenlinks sind deaktiviert (maestriBridge.agentLinks).',
  'notes.error.fileTooLong': 'Agentenlink ignoriert: Der Dateipfad ist zu lang.',
  'notes.error.invalidAgent': 'Agentenlink ignoriert: Die Agenten-ID ist ungültig.',
  'notes.error.invalidLines': 'Agentenlink ignoriert: Die Zeilen sind ungültig.',
  'notes.error.missingFile': 'Agentenlink ignoriert: Es ist keine Datei angegeben.',
  'notes.error.nameTooLong': 'Agentenlink ignoriert: Der Agentenname ist zu lang.',
  'notes.error.noAgent':
    'Diese Notiz hat nicht angegeben, welcher Agent sie gesendet hat, daher gibt es niemanden zum Antworten.',
  'notes.error.notFound':
    '{name} wollte {file} öffnen, aber die Datei ist nicht in den in diesem Fenster geöffneten Ordnern.',
  'notes.error.outsideWorkspace':
    '{name} wollte {file} öffnen, aber die Datei liegt außerhalb der in diesem Fenster geöffneten Ordner.',
  'notes.error.textTooLong': 'Agentenlink ignoriert: Die Notiz ist zu lang.',
  'notes.label': '{name} · {index} von {total}',
  'notes.label.single': '{name}',
  'notes.reply.placeholder': 'Dem Agenten antworten…',
  'notes.reply.prompt': 'Antworten',
};
