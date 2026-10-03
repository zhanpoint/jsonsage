import { useEffect, useRef, useState } from 'react';
import type { PaletteCommand } from '../components/CommandPalette';
import { readShortcuts, shortcutFromEvent } from '../lib/shortcuts';
import { editorAt } from '../lib/codeEditor';

export function useShortcuts() {
  const [bindings, setBindings] = useState(() => readShortcuts(localStorage.getItem('jsonsage-shortcuts')));
  useEffect(() => { localStorage.setItem('jsonsage-shortcuts', JSON.stringify(bindings)); }, [bindings]);
  return { bindings, setBindings };
}
export function useCommandKeyboard(commands: PaletteCommand[], flush: () => void) {
  const latest = useRef({ commands, flush }); latest.current = { commands, flush };
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || event.getModifierState('AltGraph')) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('dialog:not(.command-dialog)')) return;
      const shortcut = shortcutFromEvent(event);
      if (!shortcut) return;
      const command = latest.current.commands.find(item => item.binding === shortcut);
      if (!command || command.disabled) return;
      // Preserve native text-field editing; CM6 editor commands still use its own APIs.
      const editor = editorAt(target);
      if (command.nativeEditing && target?.closest('input,textarea,[contenteditable],.cm-editor') && !editor) return;
      event.preventDefault(); event.stopPropagation();
      if (command.nativeEditing && editor) { editor[command.id as 'undo' | 'redo'](); return; }
      latest.current.flush();
      requestAnimationFrame(() => {
        const current = latest.current.commands.find(item => item.id === command.id);
        if (current && !current.disabled) current.run();
      });
    };
    window.addEventListener('keydown', handle, true);
    return () => window.removeEventListener('keydown', handle, true);
  }, []);
}
