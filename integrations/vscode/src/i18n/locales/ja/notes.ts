import type { notes as source } from '../en/notes.ts';

export const notes: Record<keyof typeof source, string> = {
  'notes.added': '{name} がノートを追加しました（{index}/{total}）。ノートの矢印で順に移動できます。',
  'notes.author.agent': 'エージェント',
  'notes.author.you': 'あなた',
  'notes.empty': '移動できるエージェントノートはありません。',
  'notes.error.agentNotFound': 'Maestri で {name} が見つかりませんでした。',
  'notes.error.disabled':
    'エージェントがここでコードを開こうとしましたが、エージェントリンクが無効になっています（maestriBridge.agentLinks）。',
  'notes.error.fileTooLong': 'エージェントリンクを無視しました：ファイルパスが長すぎます。',
  'notes.error.invalidAgent': 'エージェントリンクを無視しました：エージェント ID が無効です。',
  'notes.error.invalidLines': 'エージェントリンクを無視しました：行が無効です。',
  'notes.error.missingFile': 'エージェントリンクを無視しました：ファイルが指定されていません。',
  'notes.error.nameTooLong': 'エージェントリンクを無視しました：エージェント名が長すぎます。',
  'notes.error.noAgent': 'このノートには送信したエージェントが記載されていないため、返信できません。',
  'notes.error.notFound': '{name} が {file} を開こうとしましたが、このウィンドウで開いているフォルダーにありません。',
  'notes.error.outsideWorkspace':
    '{name} が {file} を開こうとしましたが、このウィンドウで開いているフォルダーの外にあります。',
  'notes.error.textTooLong': 'エージェントリンクを無視しました：ノートが長すぎます。',
  'notes.label': '{name} · {index}/{total}',
  'notes.label.single': '{name}',
  'notes.reply.placeholder': 'エージェントに返信…',
  'notes.reply.prompt': '返信',
};
