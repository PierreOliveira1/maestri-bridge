import { agents } from './agents.ts';
import { compose } from './compose.ts';
import { notes } from './notes.ts';

export const en = { ...agents, ...compose, ...notes };
