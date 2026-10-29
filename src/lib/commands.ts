import { IndentIncrease, Wrench, ShieldCheck, Minimize2, EyeOff, Search, FolderOpen, Link2, ClipboardCheck, Download, Undo2, Redo2, TextQuote, Quote, Code2, ListTree, Table2, Workflow, GitCompareArrows, FileCode2, MonitorDown, Command, Keyboard, Copy, History, BookmarkPlus, FilePlus2 } from 'lucide-react';

export const commandDefinitions = {
  palette: { icon: Command, tone: 'violet', shortcut: 'Mod+K' },
  history: { icon: History, tone: 'amber', shortcut: 'Alt+H' },
  newHistory: { icon: FilePlus2, tone: 'blue', shortcut: 'Alt+N' },
  saveHistory: { icon: BookmarkPlus, tone: 'green', shortcut: 'Mod+S' },
  shortcuts: { icon: Keyboard, tone: 'slate', shortcut: 'Alt+K' },
  format: { icon: IndentIncrease, tone: 'blue', shortcut: 'Mod+Enter' },
  repair: { icon: Wrench, tone: 'amber', shortcut: 'Alt+R' },
  validate: { icon: ShieldCheck, tone: 'green', shortcut: 'Alt+V' },
  minify: { icon: Minimize2, tone: 'blue', shortcut: 'Alt+M' },
  mask: { icon: EyeOff, tone: 'violet', shortcut: 'Alt+P' },
  search: { icon: Search, tone: 'blue', shortcut: 'Mod+F' },
  open: { icon: FolderOpen, tone: 'amber', shortcut: 'Mod+O' },
  url: { icon: Link2, tone: 'cyan', shortcut: 'Alt+U' },
  copy: { icon: ClipboardCheck, tone: 'green', shortcut: 'Alt+C' },
  copyRaw: { icon: Copy, tone: 'green', shortcut: 'Alt+Y' },
  export: { icon: Download, tone: 'green', shortcut: 'Alt+X' },
  undo: { icon: Undo2, tone: 'slate', shortcut: 'Mod+Z' },
  redo: { icon: Redo2, tone: 'slate', shortcut: 'Mod+Y' },
  unescape: { icon: TextQuote, tone: 'amber', shortcut: 'Alt+W' },
  escape: { icon: Quote, tone: 'amber', shortcut: 'Alt+Q' },
  code: { icon: Code2, tone: 'blue', shortcut: 'Alt+1' },
  tree: { icon: ListTree, tone: 'green', shortcut: 'Alt+2' },
  table: { icon: Table2, tone: 'cyan', shortcut: 'Alt+3' },
  graph: { icon: Workflow, tone: 'violet', shortcut: 'Alt+4' },
  diff: { icon: GitCompareArrows, tone: 'amber', shortcut: 'Alt+7' },
  types: { icon: FileCode2, tone: 'violet', shortcut: 'Alt+8' },
  install: { icon: MonitorDown, tone: 'blue', shortcut: 'Alt+I' },
} as const;
export type CommandId = keyof typeof commandDefinitions;
export type IconTone = typeof commandDefinitions[CommandId]['tone'];
export const viewTabs = ['code', 'tree', 'table', 'graph', 'diff', 'types'] as const;
export const defaultShortcuts = Object.fromEntries(Object.entries(commandDefinitions).map(([id, item]) => [id, item.shortcut])) as Record<CommandId, string>;
