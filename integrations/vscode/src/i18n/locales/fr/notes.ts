import type { notes as source } from '../en/notes.ts';

export const notes: Record<keyof typeof source, string> = {
  'notes.added': '{name} a ajouté une note ({index} sur {total}). Utilisez les flèches de la note pour les parcourir.',
  'notes.author.agent': 'Agent',
  'notes.author.you': 'Vous',
  'notes.empty': 'Aucune note d’agent à parcourir.',
  'notes.error.agentNotFound': 'Impossible de trouver {name} dans Maestri.',
  'notes.error.disabled':
    'Un agent a tenté d’ouvrir du code ici, mais les liens d’agents sont désactivés (maestriBridge.agentLinks).',
  'notes.error.fileTooLong': 'Lien d’agent ignoré : le chemin du fichier est trop long.',
  'notes.error.invalidAgent': 'Lien d’agent ignoré : l’id de l’agent n’est pas valide.',
  'notes.error.invalidLines': 'Lien d’agent ignoré : les lignes ne sont pas valides.',
  'notes.error.missingFile': 'Lien d’agent ignoré : aucun fichier.',
  'notes.error.nameTooLong': 'Lien d’agent ignoré : le nom de l’agent est trop long.',
  'notes.error.noAgent':
    'Cette note n’indique pas quel agent l’a envoyée, il n’y a donc personne à qui répondre.',
  'notes.error.notFound':
    '{name} a demandé d’ouvrir {file}, mais il ne se trouve pas dans les dossiers ouverts dans cette fenêtre.',
  'notes.error.outsideWorkspace':
    '{name} a demandé d’ouvrir {file}, qui se trouve en dehors des dossiers ouverts dans cette fenêtre.',
  'notes.error.textTooLong': 'Lien d’agent ignoré : la note est trop longue.',
  'notes.label': '{name} · {index} sur {total}',
  'notes.label.single': '{name}',
  'notes.reply.placeholder': 'Répondre à l’agent…',
  'notes.reply.prompt': 'Répondre',
};
