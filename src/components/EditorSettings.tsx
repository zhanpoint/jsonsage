import { useEffect, useRef, useState } from 'react';
import { Settings, Keyboard, ChevronRight } from 'lucide-react';
import type { Indent } from '../lib/json/transforms';

interface Props {
  language: 'en' | 'zh';
  indent: Indent;
  onIndentChange: (value: Indent) => void;
  onShortcuts: () => void;
}

export function EditorSettings({ language, indent, onIndentChange, onShortcuts }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const zh = language === 'zh';
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return <div className="editor-settings" ref={rootRef}>
    <button ref={buttonRef} className="header-control" type="button" aria-label={zh ? '编辑器设置' : 'Editor settings'} data-tooltip={zh ? '编辑器设置' : 'Editor settings'} aria-expanded={open} aria-controls={open ? 'editor-settings-panel' : undefined} onClick={() => setOpen(!open)}><Settings size={18} aria-hidden="true" /></button>
    {open && <section id="editor-settings-panel" className="settings-panel" aria-label={zh ? '编辑器设置' : 'Editor settings'}>
      <strong>{zh ? '编辑器设置' : 'Editor settings'}</strong>
      <fieldset className="indent-options"><legend>{zh ? '格式化缩进' : 'Formatting indentation'}</legend>
        <div className="indent-segments">{(['2', '4', 'tab'] as const).map((value) => <label key={value}>
          <input type="radio" name="editor-indent" value={value} checked={indent === value} onChange={() => onIndentChange(value)} />
          <span>{value === 'tab' ? 'Tab' : zh ? `${value} 空格` : `${value} spaces`}</span>
        </label>)}</div>
      </fieldset>
      <p>{zh ? '用于格式化和 Tab 键插入，自动保存。' : 'Used for formatting and Tab insertion. Saved automatically.'}</p>
      <button className="settings-shortcuts" onClick={() => { setOpen(false); onShortcuts(); }}><Keyboard size={16} /><span>{zh ? '快捷键设置' : 'Keyboard shortcuts'}</span><ChevronRight size={14} /></button>
    </section>}
  </div>;
}
