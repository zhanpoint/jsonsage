import { useEffect, useRef, useState } from 'react';
import { Keyboard, RotateCcw, X } from 'lucide-react';
import type { PaletteCommand } from './CommandPalette';
import { defaultShortcuts, type CommandId } from '../lib/commands';
import { shortcutConflict, shortcutFromEvent, shortcutLabel, type ShortcutMap } from '../lib/shortcuts';

export default function ShortcutSettings({ commands, bindings, onChange, onClose, language }: {
  commands: PaletteCommand[]; bindings: ShortcutMap; onChange: (value: ShortcutMap) => void; onClose: () => void; language: 'zh' | 'en';
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [recording, setRecording] = useState<CommandId | null>(null);
  const [error, setError] = useState('');
  const zh = language === 'zh';
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="shortcut-dialog" aria-label={zh ? '快捷键设置' : 'Keyboard shortcuts'} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header><Keyboard size={18} /><strong>{zh ? '快捷键设置' : 'Keyboard shortcuts'}</strong><button className="tool-button" aria-label={zh ? '关闭' : 'Close'} onClick={onClose}><X size={16} /></button></header>
    <p>{zh ? '默认只需两键。点击键位即可修改，按 Esc 取消，修改自动保存。' : 'Defaults use two keys. Click a shortcut to change it; Esc cancels. Changes save automatically.'}</p>
    <div className="shortcut-list">{commands.map(item => <div className="shortcut-row" key={item.id} data-tone={item.tone}>
      <item.icon size={16} /><span>{item.label}</span><button className={recording === item.id ? 'shortcut-record recording' : 'shortcut-record'} aria-label={`${zh ? '设置快捷键：' : 'Set shortcut: '}${item.label}`} onClick={() => { setRecording(item.id); setError(''); }} onBlur={() => setRecording(null)} onKeyDown={event => {
        if (recording !== item.id) return;
        event.preventDefault(); event.stopPropagation();
        if (event.key === 'Escape') { setRecording(null); setError(''); return; }
        const value = shortcutFromEvent(event.nativeEvent);
        if (!value) return;
        const conflict = shortcutConflict(bindings, item.id, value);
        if (conflict) { setError(`${zh ? '快捷键已用于：' : 'Already used by: '}${commands.find(command => command.id === conflict)?.label ?? conflict}`); return; }
        onChange({ ...bindings, [item.id]: value }); setRecording(null); setError('');
      }}><kbd>{recording === item.id ? (zh ? '请按组合键…' : 'Press keys…') : shortcutLabel(bindings[item.id])}</kbd></button>
    </div>)}</div>
    <footer><span role="status">{error || (zh ? 'Alt + 1～8 切换视图；— 表示未设置。请避开浏览器保留键位。' : 'Alt + 1–8 switches views; — means unassigned. Avoid browser-reserved shortcuts.')}</span><button onClick={() => { onChange({ ...defaultShortcuts }); setRecording(null); setError(''); }}><RotateCcw size={14} />{zh ? '恢复默认' : 'Reset defaults'}</button></footer>
  </dialog>;
}
