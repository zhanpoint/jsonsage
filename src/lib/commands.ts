import { AlignLeft, Wrench, ShieldCheck, Minimize2, ShieldEllipsis, Search, Columns2, FolderOpen, Link2, ClipboardCheck, Download, Undo2, Redo2, TextQuote, Quote, Code2, ListTree, Table2, Workflow, ListFilter, GitCompareArrows, Terminal, FileCode2, MonitorDown, Command, Keyboard, Copy } from 'lucide-react';

export const commandDefinitions = {
  palette: { icon: Command, tone: 'violet', shortcut: 'Mod+K' },
  shortcuts: { icon: Keyboard, tone: 'slate', shortcut: 'Mod+Alt+K' },
  format: { icon: AlignLeft, tone: 'blue', shortcut: 'Mod+Enter' },
  repair: { icon: Wrench, tone: 'amber', shortcut: 'Mod+Alt+R' },
  validate: { icon: ShieldCheck, tone: 'green', shortcut: 'Mod+Alt+V' },
  minify: { icon: Minimize2, tone: 'blue', shortcut: 'Mod+Alt+M' },
  mask: { icon: ShieldEllipsis, tone: 'violet', shortcut: 'Mod+Alt+D' },
  search: { icon: Search, tone: 'blue', shortcut: 'Mod+F' },
  split: { icon: Columns2, tone: 'blue', shortcut: 'Mod+Alt+B' },
  open: { icon: FolderOpen, tone: 'amber', shortcut: 'Mod+Alt+O' },
  url: { icon: Link2, tone: 'cyan', shortcut: 'Mod+Alt+U' },
  copy: { icon: ClipboardCheck, tone: 'green', shortcut: 'Mod+Alt+C' },
  copyRaw: { icon: Copy, tone: 'green', shortcut: 'Mod+Alt+Shift+C' },
  export: { icon: Download, tone: 'green', shortcut: 'Mod+Alt+E' },
  undo: { icon: Undo2, tone: 'slate', shortcut: 'Mod+Z' },
  redo: { icon: Redo2, tone: 'slate', shortcut: 'Mod+Shift+Z' },
  unescape: { icon: TextQuote, tone: 'amber', shortcut: 'Mod+Alt+Shift+Q' },
  escape: { icon: Quote, tone: 'amber', shortcut: 'Mod+Alt+Q' },
  code: { icon: Code2, tone: 'blue', shortcut: 'Mod+Alt+1' },
  tree: { icon: ListTree, tone: 'green', shortcut: 'Mod+Alt+2' },
  table: { icon: Table2, tone: 'cyan', shortcut: 'Mod+Alt+3' },
  graph: { icon: Workflow, tone: 'violet', shortcut: 'Mod+Alt+4' },
  query: { icon: ListFilter, tone: 'cyan', shortcut: 'Mod+Alt+5' },
  jq: { icon: Terminal, tone: 'green', shortcut: 'Mod+Alt+6' },
  diff: { icon: GitCompareArrows, tone: 'amber', shortcut: 'Mod+Alt+7' },
  types: { icon: FileCode2, tone: 'violet', shortcut: 'Mod+Alt+8' },
  install: { icon: MonitorDown, tone: 'blue', shortcut: 'Mod+Alt+I' },
} as const;
export type CommandId = keyof typeof commandDefinitions;
export type IconTone = typeof commandDefinitions[CommandId]['tone'];
export const viewTabs = ['code', 'split', 'tree', 'table', 'graph', 'query', 'jq', 'diff', 'types'] as const;
export const viewOrder = viewTabs.filter((id): id is Exclude<typeof viewTabs[number], 'split'> => id !== 'split');
export const defaultShortcuts = Object.fromEntries(Object.entries(commandDefinitions).map(([id, item]) => [id, item.shortcut])) as Record<CommandId, string>;
