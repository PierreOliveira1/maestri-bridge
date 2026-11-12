import type { en } from './locales/en/index.ts';

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
export type MessageParams = Readonly<Record<string, string | number>>;
