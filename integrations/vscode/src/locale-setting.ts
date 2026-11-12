import * as vscode from 'vscode';
import { resolveLocale, setLocale } from './i18n/index.ts';
import type { LocaleId } from './i18n/index.ts';

export function configuredLocale(): LocaleId {
  const value = vscode.workspace
    .getConfiguration('maestriBridge')
    .get<string>('language', 'auto');
  return resolveLocale(value === 'auto' ? vscode.env.language : value);
}

export function registerLocale(onChange: () => void): vscode.Disposable {
  setLocale(configuredLocale());
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('maestriBridge.language')) {
      setLocale(configuredLocale());
      onChange();
    }
  });
}
