import type { notes as source } from '../en/notes.ts';

export const notes: Record<keyof typeof source, string> = {
  'notes.added': '{name} adicionou uma nota ({index} de {total}). Use as setas na nota para navegar entre elas.',
  'notes.author.agent': 'Agente',
  'notes.author.you': 'Você',
  'notes.empty': 'Nenhuma nota de agente para navegar.',
  'notes.error.agentNotFound': 'Não foi possível encontrar {name} no Maestri.',
  'notes.error.disabled':
    'Um agente tentou abrir código aqui, mas os links de agentes estão desligados (maestriBridge.agentLinks).',
  'notes.error.fileTooLong': 'Link de agente ignorado: o caminho do arquivo é longo demais.',
  'notes.error.invalidAgent': 'Link de agente ignorado: o id do agente não é válido.',
  'notes.error.invalidLines': 'Link de agente ignorado: as linhas não são válidas.',
  'notes.error.missingFile': 'Link de agente ignorado: não há arquivo.',
  'notes.error.nameTooLong': 'Link de agente ignorado: o nome do agente é longo demais.',
  'notes.error.noAgent': 'Esta nota não indicou qual agente a enviou, então não há ninguém para responder.',
  'notes.error.notFound': '{name} pediu para abrir {file}, mas ele não está nas pastas abertas nesta janela.',
  'notes.error.outsideWorkspace':
    '{name} pediu para abrir {file}, que está fora das pastas abertas nesta janela.',
  'notes.error.textTooLong': 'Link de agente ignorado: a nota é longa demais.',
  'notes.label': '{name} · {index} de {total}',
  'notes.label.single': '{name}',
  'notes.reply.placeholder': 'Responda ao agente…',
  'notes.reply.prompt': 'Responder',
};
