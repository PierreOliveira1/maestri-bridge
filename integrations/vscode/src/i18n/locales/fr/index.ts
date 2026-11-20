import { follow } from './follow.ts';
import type { Messages } from '../../messages.ts';
import { agents } from './agents.ts';
import { chat } from './chat.ts';
import { compose } from './compose.ts';
import { notes } from './notes.ts';

export const fr: Messages = { ...agents, ...chat, ...compose, ...notes, ...follow };
