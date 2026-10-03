import { defaultShortcuts, type CommandId } from './commands';
export type ShortcutMap = Record<CommandId, string>;
type KeyEvent = Pick<KeyboardEvent, 'code' | 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;
const modifiers = new Set(['Control', 'Meta', 'Alt', 'Shift']);
/** Physical key codes keep shortcuts stable across keyboard layouts and shifted digits. */
export function shortcutFromEvent(event: KeyEvent): string | null {
  if (modifiers.has(event.key)) return null;
  const key = event.code.replace(/^(Key|Digit)/, '') || event.key;
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !/^F\d{1,2}$/.test(key)) return null;
  return [event.ctrlKey || event.metaKey ? 'Mod' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', key].filter(Boolean).join('+');
}
export function shortcutLabel(value: string) {
  return value.split('+').map(key => ({ Mod: 'Ctrl/⌘', Enter: '↵', Space: 'Space' }[key] ?? key)).join(' + ');
}
export function shortcutConflict(map: ShortcutMap, id: CommandId, value: string): CommandId | undefined {
  return (Object.keys(map) as CommandId[]).find(key => key !== id && map[key] === value);
}
export function readShortcuts(raw: string | null): ShortcutMap {
  const result = { ...defaultShortcuts };
  try {
    const saved = JSON.parse(raw ?? '{}');
    for (const id of Object.keys(result) as CommandId[]) {
      const value = saved?.[id];
      if (typeof value === 'string' && /^(?:Mod\+)?(?:Alt\+)?(?:Shift\+)?[A-Za-z0-9]+$/.test(value) && (/^(Mod|Alt)\+/.test(value) || /^(?:Shift\+)?F\d{1,2}$/.test(value))) result[id] = value;
    }
    if (new Set(Object.values(result)).size !== Object.keys(result).length) return { ...defaultShortcuts };
  } catch { /* Corrupt preferences do not prevent opening the editor. */ }
  return result;
}
