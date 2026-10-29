import { defaultShortcuts, type CommandId } from './commands';
export type ShortcutMap = Record<CommandId, string>;
type KeyEvent = Pick<KeyboardEvent, 'code' | 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;
const modifiers = new Set(['Control', 'Meta', 'Alt', 'Shift']);
// Snapshot of v1 defaults: only user overrides survive the move to simpler defaults.
const legacyDefaults: Partial<ShortcutMap> = {
  palette: 'Mod+K', history: 'Mod+Alt+H', newHistory: 'Mod+Alt+N', saveHistory: 'Mod+Alt+S',
  shortcuts: 'Mod+Alt+K', format: 'Mod+Enter', repair: 'Mod+Alt+R', validate: 'Mod+Alt+V',
  minify: 'Mod+Alt+M', mask: 'Mod+Alt+D', search: 'Mod+F', open: 'Mod+Alt+O',
  url: 'Mod+Alt+U', copy: 'Mod+Alt+C', copyRaw: 'Mod+Alt+Shift+C', export: 'Mod+Alt+E',
  undo: 'Mod+Z', redo: 'Mod+Shift+Z', unescape: 'Mod+Alt+Shift+Q', escape: 'Mod+Alt+Q',
  code: 'Mod+Alt+1', tree: 'Mod+Alt+2', table: 'Mod+Alt+3', graph: 'Mod+Alt+4',
  diff: 'Mod+Alt+7', types: 'Mod+Alt+8', install: 'Mod+Alt+I',
};
/** Physical key codes keep shortcuts stable across keyboard layouts and shifted digits. */
export function shortcutFromEvent(event: KeyEvent): string | null {
  if (modifiers.has(event.key) || event.key === 'Dead') return null;
  const key = event.code.replace(/^(Key|Digit)/, '') || event.key;
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !/^F\d{1,2}$/.test(key)) return null;
  return [event.ctrlKey || event.metaKey ? 'Mod' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', key].filter(Boolean).join('+');
}
export function shortcutLabel(value: string) {
  return value ? value.split('+').map(key => ({ Mod: 'Ctrl/⌘', Enter: '↵', Space: 'Space' }[key] ?? key)).join(' + ') : '—';
}
export function shortcutConflict(map: ShortcutMap, id: CommandId, value: string): CommandId | undefined {
  return (Object.keys(map) as CommandId[]).find(key => key !== id && map[key] === value);
}
export function readShortcuts(raw: string | null): ShortcutMap {
  const result = { ...defaultShortcuts };
  try {
    const saved = JSON.parse(raw ?? '{}');
    const current = saved?.version === 2;
    const values = current ? saved.overrides : saved;
    const assigned = new Set<CommandId>(), used = new Set<string>();
    for (const id of Object.keys(result) as CommandId[]) {
      const value = values?.[id];
      if (typeof value !== 'string' || (!current && value === legacyDefaults[id])) continue;
      if (value && (!/^(?:Mod\+)?(?:Alt\+)?(?:Shift\+)?[A-Za-z0-9]+$/.test(value) || !(/^(Mod|Alt)\+/.test(value) || /^(?:Shift\+)?F\d{1,2}$/.test(value)) || used.has(value))) continue;
      result[id] = value; assigned.add(id);
      if (value) used.add(value);
    }
    // Explicit overrides take priority when an updated default occupies their key.
    for (const id of Object.keys(result) as CommandId[]) {
      if (assigned.has(id)) continue;
      result[id] = used.has(result[id]) ? '' : result[id];
      if (result[id]) used.add(result[id]);
    }
  } catch { /* Corrupt preferences do not prevent opening the editor. */ }
  return result;
}
export function writeShortcuts(bindings: ShortcutMap): string {
  const overrides = Object.fromEntries(Object.entries(bindings).filter(([id, value]) => value !== defaultShortcuts[id as CommandId]));
  return JSON.stringify({ version: 2, overrides });
}
