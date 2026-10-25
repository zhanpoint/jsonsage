import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { ContextMenu } from '@base-ui/react/context-menu';
import { FileJson2, Pencil, Pin, PinOff, Plus, Save, X } from 'lucide-react';
import type { DocumentTab } from '../lib/documentWorkspace';
import { HelpTooltip } from './ui/HelpTooltip';

export function DocumentTabs({ tabs, activeId, language, onSelect, onClose, onPin, onRename, onNew, onSave, newShortcut, saveShortcut, history, children }: {
  tabs: DocumentTab[]; activeId: string; language: 'zh' | 'en'; onSelect: (id: string) => void;
  onClose: (id: string) => void; onPin: (id: string, pinned: boolean) => void; onRename: (id: string, name: string) => void; onNew: () => void; onSave: () => void;
  newShortcut: string; saveShortcut: string; history: ReactNode; children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const portalContainer = useRef<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const text = (cn: string, en: string) => language === 'zh' ? cn : en;
  useEffect(() => { root.current?.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [activeId]);
  return <Tabs.Root ref={node => { root.current = node; portalContainer.current = node?.closest<HTMLElement>('.app-shell') ?? null; }} value={activeId} onValueChange={id => { if (typeof id === 'string') onSelect(id); }}>
    <div className="document-tabbar"><Tabs.List className="document-tabs" activateOnFocus aria-label={text('文档标签页', 'Document tabs')}>
      {tabs.map(tab => {
        const { draft, dirty, saving, error } = tab.session.snapshot();
        const label = text('标签操作', 'Tab actions');
        const actions = [
          { label: text('重命名', 'Rename'), icon: Pencil, run: () => setRenaming(tab.id) },
          { label: tab.pinned ? text('取消固定', 'Unfix tab') : text('固定标签页', 'Fix tab'), icon: tab.pinned ? PinOff : Pin, run: () => onPin(tab.id, !tab.pinned) },
          ...(!tab.pinned ? [{ label: text('关闭标签页', 'Close tab'), icon: X, run: () => onClose(tab.id) }] : []),
        ];
        return <ContextMenu.Root key={tab.id}>
          <ContextMenu.Trigger render={<div className="document-tab" data-active={tab.id === activeId} data-fixed={tab.pinned} aria-label={`${label}：${draft?.fileName}`} onDoubleClick={() => setRenaming(tab.id)} />}>
            {renaming === tab.id
              ? <span className="document-tab-label"><FileJson2 size={14} /><input className="document-tab-rename" autoFocus defaultValue={draft?.fileName} aria-label={text('重命名', 'Rename')} spellCheck={false}
                  onFocus={event => event.currentTarget.select()}
                  onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); else if (event.key === 'Escape') setRenaming(null); }}
                  onBlur={event => { const name = event.currentTarget.value.trim(); if (renaming === tab.id) { setRenaming(null); if (name && name !== draft?.fileName) onRename(tab.id, name); } }} /></span>
              : <Tabs.Tab className="document-tab-label" value={tab.id} title={draft?.fileName}>{tab.pinned ? <Pin size={13} /> : <FileJson2 size={14} />}<span>{draft?.fileName}</span>{(dirty || saving || !!error) && <i className="document-unsaved" data-error={!!error} aria-label={error ? text('保存失败', 'Save failed') : text('尚未保存', 'Unsaved')} />}</Tabs.Tab>}
            {!tab.pinned && renaming !== tab.id && <button className="record-icon tab-close" aria-label={`${text('关闭标签页', 'Close tab')}：${draft?.fileName}`} onClick={() => onClose(tab.id)}><X size={13} /></button>}
          </ContextMenu.Trigger>
          <ContextMenu.Portal container={portalContainer}><ContextMenu.Positioner className="record-menu-positioner" collisionPadding={10}><ContextMenu.Popup className="record-menu">
            {actions.map(action => <ContextMenu.Item key={action.label} className="record-menu-item" onClick={action.run}><action.icon size={14} /><span>{action.label}</span></ContextMenu.Item>)}
          </ContextMenu.Popup></ContextMenu.Positioner></ContextMenu.Portal>
        </ContextMenu.Root>;
      })}
    </Tabs.List><div className="document-tab-actions">
      <HelpTooltip label={`${text('新建标签页', 'New tab')} · ${newShortcut}`}><button className="record-icon" aria-label={text('新建标签页', 'New tab')} onClick={onNew}><Plus size={18} /></button></HelpTooltip>
      <HelpTooltip label={`${text('保存记录', 'Save record')} · ${saveShortcut}`}><button className="record-icon tab-save" aria-label={text('保存记录', 'Save record')} onClick={onSave}><Save size={16} /></button></HelpTooltip>
      {history}
    </div></div>
    <Tabs.Panel value={activeId} className="document-panel">{children}</Tabs.Panel>
  </Tabs.Root>;
}
