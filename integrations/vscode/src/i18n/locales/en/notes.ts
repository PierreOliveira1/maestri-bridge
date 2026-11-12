export const notes = {
  'notes.added': '{name} added a note ({index} of {total}). Use the arrows on the note to go through them.',
  'notes.author.agent': 'Agent',
  'notes.author.you': 'You',
  'notes.empty': 'No agent notes to go through.',
  'notes.error.agentNotFound': 'Could not find {name} in Maestri anymore.',
  'notes.error.disabled':
    'An agent tried to open code here, but agent links are turned off (maestriBridge.agentLinks).',
  'notes.error.fileTooLong': 'Ignored an agent link: the file path is too long.',
  'notes.error.invalidAgent': 'Ignored an agent link: the agent id is not valid.',
  'notes.error.invalidLines': 'Ignored an agent link: the lines are not valid.',
  'notes.error.missingFile': 'Ignored an agent link: it has no file.',
  'notes.error.nameTooLong': 'Ignored an agent link: the agent name is too long.',
  'notes.error.noAgent': 'This note did not say which agent sent it, so there is nobody to reply to.',
  'notes.error.notFound': '{name} asked to open {file}, but it is not in the folders open in this window.',
  'notes.error.outsideWorkspace':
    '{name} asked to open {file}, which is outside the folders open in this window.',
  'notes.error.textTooLong': 'Ignored an agent link: the note is too long.',
  'notes.label': '{name} · {index} of {total}',
  'notes.label.single': '{name}',
  'notes.reply.placeholder': 'Reply to the agent…',
  'notes.reply.prompt': 'Reply',
} satisfies Record<string, string>;
