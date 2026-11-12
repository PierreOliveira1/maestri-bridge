import type { Messages } from '../../messages.ts';
import { agents } from './agents.ts';
import { compose } from './compose.ts';

export const de: Messages = { ...agents, ...compose };
