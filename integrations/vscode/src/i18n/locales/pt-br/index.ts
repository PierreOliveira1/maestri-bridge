import type { Messages } from '../../messages.ts';
import { agents } from './agents.ts';
import { compose } from './compose.ts';

export const ptBr: Messages = { ...agents, ...compose };
