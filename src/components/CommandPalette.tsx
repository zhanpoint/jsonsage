import { useEffect, useRef } from 'react';
import { Command } from 'cmdk';
import { Search, ArrowUp, ArrowDown, CornerDownLeft, type LucideIcon } from 'lucide-react';
import type { CommandId, IconTone } from '../lib/commands';
import { shortcutLabel } from '../lib/shortcuts';
export type PaletteCommand = { id: CommandId; label: string; icon: LucideIcon; tone: IconTone; binding: string; nativeEditing?: boolean; disabled?: boolean; run: () => void };
export default function CommandPalette({ commands, language, onClose }: { commands: PaletteCommand[]; language: 'zh' | 'en'; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { dialog.current?.showModal(); search.current?.focus(); }, []);
  const zh = language === 'zh';
  return <dialog ref={dialog} className="command-dialog" aria-label={zh ? '命令面板' : 'Command palette'} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <Command label={zh ? '命令面板' : 'Command palette'} loop>
      <div className="command-search"><Search size={18} /><Command.Input ref={search} placeholder={zh ? '搜索操作、视图…' : 'Search actions and views…'} /><button className="tool-button" onClick={onClose} aria-label={zh ? '关闭' : 'Close'}><kbd>Esc</kbd></button></div>
      <Command.List>
        <Command.Empty>{zh ? '没有匹配的操作' : 'No matching actions'}</Command.Empty>
        {commands.map(item => <Command.Item key={item.id} value={item.label} keywords={[item.id]} disabled={item.disabled} onSelect={() => { onClose(); item.run(); }} data-tone={item.tone}><span className="command-icon"><item.icon size={16} /></span><span>{item.label}</span><kbd>{shortcutLabel(item.binding)}</kbd></Command.Item>)}
      </Command.List>
      <footer><span><ArrowUp size={12} /><ArrowDown size={12} />{zh ? '选择' : 'Navigate'}</span><span><CornerDownLeft size={12} />{zh ? '执行' : 'Run'}</span><span>{zh ? '所有计算均在本地完成' : 'All computation stays local'}</span></footer>
    </Command>
  </dialog>;
}
