import { useEffect, useMemo, useRef, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, FileJson2, History, PanelTop, Pencil, Pin, PinOff, Search, Trash2, X } from 'lucide-react';
import { historyStore, type HistoryCursor, type HistoryEntry, type HistoryOperation } from '../lib/history';
import { ActionMenu } from './ui/ActionMenu';
import { HelpTooltip } from './ui/HelpTooltip';
import './history.css';

type Props = {
  open: boolean; onOpenChange: (open: boolean) => void; language: 'zh' | 'en'; shortcut: string;
  activeRecord?: string; fixedRecords: ReadonlySet<string>;
  onSelect: (entry: HistoryEntry, fix?: boolean) => Promise<void>;
  onUpdate: (entry: HistoryEntry, patch: { fileName?: string; pinned?: number }) => Promise<void>;
  onRemove: (entry: HistoryEntry) => Promise<void>; onUnfix: (entry: HistoryEntry) => void;
  onError: (cause: unknown, operation: HistoryOperation) => void;
};
export default function HistoryMenu(props: Props) {
  const { open, onOpenChange, language, activeRecord, fixedRecords } = props;
  const zh = language === 'zh', text = (cn: string, en: string) => zh ? cn : en;
  const container = useRef<HTMLElement | null>(null), list = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState(''), [query, setQuery] = useState('');
  const [entries, setEntries] = useState<HistoryEntry[]>([]), [next, setNext] = useState<HistoryCursor>();
  const [loading, setLoading] = useState(false), [failed, setFailed] = useState(false), [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  useEffect(() => { const timer = setTimeout(() => setQuery(search), 160); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (!open) { setEditing(null); setDeleting(null); return; }
    const id = ++sequence.current;
    setEntries([]); setNext(undefined); setLoading(true); setFailed(false);
    void historyStore.list(query).then(page => { if (sequence.current === id) { setEntries(page.items); setNext(page.next); list.current?.scrollTo(0, 0); } })
      .catch(() => { if (sequence.current === id) setFailed(true); }).finally(() => { if (sequence.current === id) setLoading(false); });
    return () => { sequence.current++; };
  }, [open, query, refresh]);
  async function more() {
    const id = sequence.current; setLoading(true);
    try { const page = await historyStore.list(query, next); if (id === sequence.current) { setEntries(value => [...value, ...page.items]); setNext(page.next); } }
    catch (cause) { props.onError(cause, 'read'); }
    finally { if (id === sequence.current) setLoading(false); }
  }
  async function perform(action: () => Promise<void>, close = false, operation: HistoryOperation = 'update') {
    setBusy(true);
    try { await action(); setEditing(null); setDeleting(null); if (close) onOpenChange(false); else setRefresh(value => value + 1); }
    catch (cause) { props.onError(cause, operation); }
    finally { setBusy(false); }
  }
  const rows = useMemo(() => {
    const result: ({ label: string; key: string } | { entry: HistoryEntry; key: string })[] = [];
    let group: number | undefined;
    for (const entry of entries) {
      if (group !== entry.pinned) { group = entry.pinned; result.push({ key: `group-${group}`, label: group ? text('置顶', 'Pinned') : text('最近', 'Recent') }); }
      result.push({ key: entry.id, entry });
    }
    return result;
  }, [entries, zh]);
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => list.current, estimateSize: index => 'entry' in rows[index] ? 40 : 28, getItemKey: index => rows[index].key, overscan: 5 });
  return <Popover.Root open={open} onOpenChange={onOpenChange}>
    <HelpTooltip label={`${text('历史记录', 'History')} · ${props.shortcut}`}><Popover.Trigger ref={(node: HTMLElement | null) => { container.current = node?.closest<HTMLElement>('.app-shell') ?? null; }} className="record-icon history-trigger" aria-label={text('历史记录', 'History')}><History size={17} /></Popover.Trigger></HelpTooltip>
    <Popover.Portal container={container}><Popover.Positioner className="history-positioner" side="bottom" align="end" sideOffset={7} collisionPadding={12}><Popover.Popup className="history-dropdown" aria-label={text('历史记录', 'History')}>
      <div className="history-search"><Search size={15} /><input type="search" aria-label={text('搜索历史记录', 'Search history')} placeholder={text('搜索标题或文件名…', 'Search title or filename…')} value={search} onChange={event => setSearch(event.target.value)} autoFocus /></div>
      <div className="history-results" ref={list} aria-busy={loading} style={{ height: Math.max(80, virtual.getTotalSize() + (next ? 36 : 0)) }}>
        <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>{virtual.getVirtualItems().map(item => {
          const row = rows[item.index];
          return <div key={row.key} className={'entry' in row ? 'history-row' : 'history-group'} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: item.size, transform: `translateY(${item.start}px)` }}>
            {'label' in row ? row.label : (() => {
              const entry = row.entry;
              if (editing?.id === entry.id) return <form className="history-rename" onSubmit={event => { event.preventDefault(); if (editing.title.trim()) void perform(() => props.onUpdate(entry, { fileName: editing.title })); }}>
                <input aria-label={text('文件名', 'Filename')} value={editing.title} maxLength={160} autoFocus onFocus={event => event.currentTarget.select()} onChange={event => setEditing({ id: entry.id, title: event.target.value })} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setEditing(null); } }} disabled={busy} />
                <button className="record-icon" type="submit" disabled={busy || !editing.title.trim()} aria-label={text('确认重命名', 'Confirm rename')}><Check size={14} /></button><button className="record-icon" type="button" aria-label={text('取消重命名', 'Cancel rename')} onClick={() => setEditing(null)}><X size={14} /></button>
              </form>;
              if (deleting === entry.id) return <div className="history-delete"><span>{text('删除记录并关闭对应标签？', 'Delete record and its open tab?')}</span><button className="record-icon danger" aria-label={text('确认删除', 'Confirm delete')} disabled={busy} onClick={() => { void perform(() => props.onRemove(entry), false, 'delete'); }}><Trash2 size={14} /></button><button className="record-icon" aria-label={text('取消删除', 'Cancel delete')} onClick={() => setDeleting(null)}><X size={14} /></button></div>;
              return <div className="history-row-content" data-active={entry.id === activeRecord}>
                <button className="history-open" disabled={busy} title={entry.fileName} aria-current={entry.id === activeRecord ? 'true' : undefined} onClick={() => { void perform(() => props.onSelect(entry), true, 'read'); }}>{entry.pinned ? <Pin size={14} /> : <FileJson2 size={15} />}<span>{entry.fileName}</span></button>
                <div className="history-row-actions"><ActionMenu label={`${text('操作', 'Actions')}：${entry.fileName}`} disabled={busy} actions={[
                  { label: text('重命名', 'Rename'), icon: Pencil, run: () => setEditing({ id: entry.id, title: entry.fileName }) },
                  { label: entry.pinned ? text('取消置顶', 'Unpin from history') : text('置顶', 'Pin to top'), icon: entry.pinned ? PinOff : Pin, run: () => { void perform(() => props.onUpdate(entry, { pinned: entry.pinned ? 0 : 1 })); } },
                  { label: fixedRecords.has(entry.id) ? text('取消固定标签页', 'Unfix tab') : text('固定标签页', 'Fix tab'), icon: PanelTop, run: () => { if (fixedRecords.has(entry.id)) props.onUnfix(entry); else void perform(() => props.onSelect(entry, true), true, 'read'); } },
                  { label: text('删除', 'Delete'), icon: Trash2, danger: true, run: () => setDeleting(entry.id) },
                ]} /></div>
              </div>;
            })()}
          </div>;
        })}</div>
        {!rows.length && <div className="history-empty">{loading ? text('正在读取…', 'Loading…') : failed ? text('无法读取历史记录', 'Unable to read history') : query ? text('没有匹配记录', 'No matches') : text('暂无历史记录', 'No history yet')}</div>}
        {next && <button className="history-more" disabled={loading} onClick={() => { void more(); }}>{loading ? text('正在读取…', 'Loading…') : text('加载更早记录', 'Load earlier records')}</button>}
        {failed && <button className="history-more" onClick={() => setRefresh(value => value + 1)}>{text('重试', 'Retry')}</button>}
      </div>
      <div className="history-local">{text('仅保存在此浏览器', 'Stored only in this browser')}</div>
    </Popover.Popup></Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}
