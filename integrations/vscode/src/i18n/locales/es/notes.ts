import type { notes as source } from '../en/notes.ts';

export const notes: Record<keyof typeof source, string> = {
  'notes.added': '{name} añadió una nota ({index} de {total}). Usa las flechas de la nota para recorrerlas.',
  'notes.author.agent': 'Agente',
  'notes.author.you': 'Tú',
  'notes.empty': 'No hay notas de agentes que recorrer.',
  'notes.error.agentNotFound': 'Ya no se encontró a {name} en Maestri.',
  'notes.error.disabled':
    'Un agente intentó abrir código aquí, pero los enlaces de agentes están desactivados (maestriBridge.agentLinks).',
  'notes.error.fileTooLong': 'Enlace de agente ignorado: la ruta del archivo es demasiado larga.',
  'notes.error.invalidAgent': 'Enlace de agente ignorado: el id del agente no es válido.',
  'notes.error.invalidLines': 'Enlace de agente ignorado: las líneas no son válidas.',
  'notes.error.missingFile': 'Enlace de agente ignorado: no tiene archivo.',
  'notes.error.nameTooLong': 'Enlace de agente ignorado: el nombre del agente es demasiado largo.',
  'notes.error.noAgent': 'Esta nota no indicó qué agente la envió, así que no hay nadie a quien responder.',
  'notes.error.notFound': '{name} pidió abrir {file}, pero no está en las carpetas abiertas en esta ventana.',
  'notes.error.outsideWorkspace':
    '{name} pidió abrir {file}, que está fuera de las carpetas abiertas en esta ventana.',
  'notes.error.textTooLong': 'Enlace de agente ignorado: la nota es demasiado larga.',
  'notes.label': '{name} · {index} de {total}',
  'notes.label.single': '{name}',
  'notes.reply.placeholder': 'Responde al agente…',
  'notes.reply.prompt': 'Responder',
};
