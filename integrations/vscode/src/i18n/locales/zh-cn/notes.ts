import type { notes as source } from '../en/notes.ts';

export const notes: Record<keyof typeof source, string> = {
  'notes.added': '{name} 添加了一条笔记（{index}/{total}）。使用笔记上的箭头浏览。',
  'notes.author.agent': '代理',
  'notes.author.you': '你',
  'notes.empty': '没有可浏览的代理笔记。',
  'notes.error.agentNotFound': '在 Maestri 中已找不到 {name}。',
  'notes.error.disabled': '代理尝试在此打开代码，但代理链接已关闭（maestriBridge.agentLinks）。',
  'notes.error.fileTooLong': '已忽略代理链接：文件路径过长。',
  'notes.error.invalidAgent': '已忽略代理链接：代理 ID 无效。',
  'notes.error.invalidLines': '已忽略代理链接：行号无效。',
  'notes.error.missingFile': '已忽略代理链接：未指定文件。',
  'notes.error.nameTooLong': '已忽略代理链接：代理名称过长。',
  'notes.error.noAgent': '此笔记未说明是哪个代理发送的，因此无人可以回复。',
  'notes.error.notFound': '{name} 请求打开 {file}，但它不在当前窗口打开的文件夹中。',
  'notes.error.outsideWorkspace': '{name} 请求打开 {file}，但它在当前窗口打开的文件夹之外。',
  'notes.error.textTooLong': '已忽略代理链接：笔记过长。',
  'notes.label': '{name} · {index}/{total}',
  'notes.label.single': '{name}',
  'notes.reply.placeholder': '回复代理…',
  'notes.reply.prompt': '回复',
};
