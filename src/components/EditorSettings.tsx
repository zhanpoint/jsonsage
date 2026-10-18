import { useRef, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Settings, Keyboard, ChevronRight } from 'lucide-react';
import type { Indent } from '../lib/json/transforms';
import { HelpTooltip } from './ui/HelpTooltip';

interface Props {
  language: 'en' | 'zh';
  indent: Indent;
  autoSave: boolean;
  onAutoSaveChange: (value: boolean) => void;
  onIndentChange: (value: Indent) => void;
  onShortcuts: () => void;
}

export function EditorSettings({ language, indent, onIndentChange, autoSave, onAutoSaveChange, onShortcuts }: Props) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLElement | null>(null);
  const zh = language === 'zh';
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <HelpTooltip side="bottom" label={zh ? '编辑器设置' : 'Editor settings'}><Popover.Trigger ref={(node: HTMLElement | null) => { container.current = node?.closest<HTMLElement>('.app-shell') ?? null; }} className="header-control" aria-label={zh ? '编辑器设置' : 'Editor settings'}><Settings size={18} aria-hidden="true" /><span>{zh ? '设置' : 'Settings'}</span></Popover.Trigger></HelpTooltip>
    <Popover.Portal container={container}><Popover.Positioner className="settings-positioner" positionMethod="fixed" side="bottom" align="end" sideOffset={8} collisionPadding={12}><Popover.Popup className="settings-panel">
      <Popover.Title className="settings-title">{zh ? '编辑器设置' : 'Editor settings'}</Popover.Title>
      <fieldset className="settings-group"><legend>{zh ? '保存方式' : 'Save mode'}</legend>
        <div className="settings-segments">{[true, false].map(value => <label key={String(value)}>
          <input type="radio" name="save-mode" checked={autoSave === value} onChange={() => onAutoSaveChange(value)} />
          <span>{value ? (zh ? '自动保存' : 'Automatic') : (zh ? '手动保存' : 'Manual')}</span>
        </label>)}</div>
      </fieldset>
      <fieldset className="settings-group"><legend>{zh ? '格式化缩进' : 'Formatting indentation'}</legend>
        <div className="settings-segments">{(['2', '4', 'tab'] as const).map((value) => <label key={value}>
          <input type="radio" name="editor-indent" value={value} checked={indent === value} onChange={() => onIndentChange(value)} />
          <span>{value === 'tab' ? 'Tab' : zh ? `${value} 空格` : `${value} spaces`}</span>
        </label>)}</div>
      </fieldset>
      <button className="settings-shortcuts" onClick={() => { setOpen(false); onShortcuts(); }}><Keyboard size={16} /><span>{zh ? '快捷键设置' : 'Keyboard shortcuts'}</span><ChevronRight size={14} /></button>
    </Popover.Popup></Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}
