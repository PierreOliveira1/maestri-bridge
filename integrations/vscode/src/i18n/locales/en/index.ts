import { follow } from './follow.ts';
import { agents } from './agents.ts';
import { chat } from './chat.ts';
import { compose } from './compose.ts';
import { notes } from './notes.ts';

export const en = { ...agents, ...chat, ...compose, ...notes, ...follow };
