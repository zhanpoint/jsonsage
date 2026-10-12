import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, FileJson2, History, Pencil, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { HistoryConflict, historyStore, type HistoryCursor, type HistoryEntry, type SavedDocument } from '../lib/history';
import type { EditorHandle } from './CodeEditor';
import type { Indent } from '../lib/json/transforms';
import { useCommandKeyboard } from '../hooks/useShortcuts';
import { commandDefinitions } from '../lib/commands';
import { shortcutLabel, type ShortcutMap } from '../lib/shortcuts';
import { HelpTooltip } from './ui/HelpTooltip';
import type { PaletteCommand } from './CommandPalette';
import './history.css';
const CodeEditor = lazy(() => import('./CodeEditor'));
type Draft = SavedDocument & { title: string; entry?: HistoryEntry };
const newDraft = (current: SavedDocument = { source: '{}', fileName: 'untitled.json', jsonc: false }): Draft => ({ ...current, title: current.fileName.replace(/\.[^.]+$/, '') || 'JSON' });
const changed = (value: Draft | null, original: Draft | null) => !!value && (!value.entry || value.title !== original?.title || value.fileName !== original?.fileName || value.source !== original?.source || value.jsonc !== original?.jsonc);

export default function HistoryDialog({ language, theme, indent, current, mode, bindings, onLoad, onClose, notify }: {
  language: 'zh' | 'en'; theme: 'light' | 'dark'; indent: Indent; current: SavedDocument; mode: 'list' | 'save' | 'new'; bindings: Pick<ShortcutMap, 'newHistory' | 'saveHistory'>;
  onLoad: (document: SavedDocument) => void; onClose: () => void; notify: (message: string, error?: boolean) => void;
}) {
  const zh = language === 'zh';
  const create = mode !== 'list';
  const text = (chinese: string, english: string) => zh ? chinese : english;
  const dialog = useRef<HTMLDialogElement>(null), editor = useRef<EditorHandle | null>(null);
  const [draft, setDraft] = useState<Draft | null>(() => create ? newDraft(mode === 'new' ? undefined : current) : null);
  const latest = useRef(draft); latest.current = draft;
  const original = useRef<Draft | null>(draft);
  const [editing, setEditing] = useState(create);
  const [editorPending, setEditorPending] = useState(false);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [search, setSearch] = useState(''), [query, setQuery] = useState('');
  const [pages, setPages] = useState<(HistoryCursor | undefined)[]>([undefined]);
  const [next, setNext] = useState<HistoryCursor>();
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const readSequence = useRef(0), mounted = useRef(true);
  const dirty = changed(draft, original.current);
  const page = pages[pages.length - 1];

  function report(cause: unknown) {
    const message = cause instanceof HistoryConflict ? text('记录已在其他标签页修改或删除，请重新选择后再操作。', 'This record changed in another tab. Select it again before editing.')
      : cause instanceof DOMException && cause.name === 'QuotaExceededError' ? text('浏览器存储空间不足，未保存。请删除不需要的记录后重试。', 'Browser storage is full. Delete unneeded records and try again.')
      : text('无法访问浏览器历史记录，请检查网站存储权限。', 'Unable to access history. Check this site’s storage permissions.');
    setError(message); notify(message, true);
  }
  useEffect(() => {
    mounted.current = true; dialog.current?.showModal();
    return () => { mounted.current = false; readSequence.current++; };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search); setPages([undefined]); }, 180);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    void historyStore.list(query, page).then(result => {
      if (active) { setEntries(result.items); setNext(result.next); }
    }).catch(cause => { if (active) report(cause); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, page, refresh]);

  function change(patch: Partial<Draft>) {
    const value = latest.current;
    if (!value) return;
    const updated = { ...value, ...patch }; latest.current = updated; setDraft(updated);
  }
  function navigate(action: () => void) {
    editor.current?.flush();
    if (changed(latest.current, original.current)) setPendingAction(() => action);
    else action();
  }
  async function select(entry: HistoryEntry) {
    const sequence = ++readSequence.current;
    setBusy(true); setError(''); setDeleting(false);
    try {
      const saved = await historyStore.read(entry.id);
      if (!mounted.current || sequence !== readSequence.current) return;
      if (!saved) throw new HistoryConflict();
      const { source, ...metadata } = saved;
      const value: Draft = { title: metadata.title, fileName: metadata.fileName, jsonc: metadata.jsonc, source, entry: metadata };
      original.current = value; latest.current = value; setDraft(value); setEditing(false);
    } catch (cause) { if (mounted.current && sequence === readSequence.current) report(cause); }
    finally { if (mounted.current && sequence === readSequence.current) setBusy(false); }
  }
  function start() {
    const value = newDraft();
    original.current = value; latest.current = value; setDraft(value); setEditing(true); setDeleting(false); setError('');
  }
  async function save() {
    editor.current?.flush();
    const value = latest.current;
    if (!value) return;
    setBusy(true); setError('');
    try {
      const entry = await historyStore.save({ ...value, source: value.entry && value.source === original.current?.source ? undefined : value.source }, value.entry);
      if (!mounted.current) return;
      const saved = { ...value, title: entry.title, fileName: entry.fileName, entry };
      latest.current = saved; original.current = saved; setDraft(saved); setEditing(false); setPages([undefined]); setRefresh(value => value + 1);
      notify(text('历史记录已保存在此浏览器。', 'History saved in this browser.'));
    } catch (cause) { if (mounted.current) report(cause); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function remove() {
    const entry = latest.current?.entry;
    if (!entry) return;
    setBusy(true); setError('');
    try {
      await historyStore.remove(entry);
      if (!mounted.current) return;
      setDraft(null); latest.current = null; original.current = null; setDeleting(false); setPages([undefined]); setRefresh(value => value + 1);
      notify(text('历史记录已删除。', 'History deleted.'));
    } catch (cause) { if (mounted.current) report(cause); }
    finally { if (mounted.current) setBusy(false); }
  }
  function revert() {
    editor.current?.flush();
    requestAnimationFrame(() => {
      if (!mounted.current) return;
      latest.current = original.current; setDraft(original.current); setEditing(!original.current?.entry);
    });
  }
  const close = () => { if (!busy) navigate(onClose); };
  const blocked = busy || deleting || !!pendingAction;
  const historyCommands: PaletteCommand[] = [
    { id: 'newHistory', label: text('新建记录', 'New record'), icon: commandDefinitions.newHistory.icon, tone: commandDefinitions.newHistory.tone, binding: bindings.newHistory, disabled: blocked, run: () => navigate(start) },
    { id: 'saveHistory', label: text('保存记录', 'Save record'), icon: commandDefinitions.saveHistory.icon, tone: commandDefinitions.saveHistory.tone, binding: bindings.saveHistory, disabled: blocked || !draft || !draft.title.trim() || !draft.fileName.trim() || !dirty && !editorPending, run: () => { void save(); } },
  ];
  useCommandKeyboard(historyCommands, () => editor.current?.flush(), dialog);
  return <dialog ref={dialog} className="history-dialog" aria-labelledby="history-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header className="history-header"><div className="history-header-title"><History size={19} /><strong id="history-title">{text('历史记录', 'History')}</strong><span>{text('仅保存在此浏览器', 'Saved only in this browser')}</span></div><div className="history-header-actions">{historyCommands.map(command => <HelpTooltip key={command.id} side="bottom" label={`${command.label} · ${shortcutLabel(command.binding)}`}><button type="button" className="history-button" data-tone={command.tone} disabled={command.disabled} onClick={command.run}><command.icon size={15} />{command.label}</button></HelpTooltip>)}<button type="button" className="tool-button" aria-label={text('关闭', 'Close')} onClick={close} disabled={busy}><X size={18} /></button></div></header>
    <div className="history-body">
      <aside className="history-sidebar">
        <div className="history-search"><Search size={15} /><input type="search" aria-label={text('搜索标题或文件名', 'Search title or filename')} placeholder={text('搜索标题或文件名', 'Search title or filename')} value={search} onChange={event => setSearch(event.target.value)} autoFocus={!create} /><button type="button" className="tool-button" aria-label={text('刷新列表', 'Refresh list')} disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} /></button></div>
        <div className="history-list" aria-busy={loading}>
          {loading ? <p className="history-empty" role="status">{text('正在读取…', 'Loading…')}</p> : entries.length ? entries.map(entry => <button type="button" className="history-entry" key={entry.id} aria-pressed={draft?.entry?.id === entry.id} disabled={busy} onClick={() => navigate(() => { void select(entry); })}>
            <span className="history-entry-title"><FileJson2 size={16} /><strong>{entry.title}</strong></span><span className="history-entry-file">{entry.fileName}</span><span className="history-entry-meta">{new Date(entry.updatedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}<span>{entry.characters.toLocaleString()} {text('字符', 'chars')}</span></span>
          </button>) : <p className="history-empty">{query ? text('没有匹配的记录', 'No matching records') : text('还没有历史记录', 'No history yet')}</p>}
        </div>
        <nav className="history-pagination" aria-label={text('历史分页', 'History pages')}><button type="button" className="tool-button" aria-label={text('上一页', 'Previous page')} disabled={loading || pages.length === 1} onClick={() => setPages(value => value.slice(0, -1))}><ArrowLeft size={16} /></button><span>{pages.length}</span><button type="button" className="tool-button" aria-label={text('下一页', 'Next page')} disabled={loading || !next} onClick={() => { if (next) setPages(value => [...value, next]); }}><ArrowRight size={16} /></button></nav>
      </aside>
      <section className="history-detail">
        {draft ? <>
          <div className="history-fields"><label>{text('标题', 'Title')}<input value={draft.title} maxLength={160} disabled={busy} onChange={event => change({ title: event.target.value })} autoFocus={create} /></label><label>{text('文件名', 'Filename')}<input value={draft.fileName} maxLength={255} disabled={busy} onChange={event => change({ fileName: event.target.value })} spellCheck={false} /></label></div>
          <div className="history-editor-heading"><span>{editing ? text('编辑内容', 'Edit content') : text('内容预览', 'Preview')} · {draft.jsonc ? 'JSONC' : 'JSON'}</span><button type="button" className="history-button" disabled={busy || editing} onClick={() => setEditing(true)}><Pencil size={14} />{text('编辑内容', 'Edit content')}</button></div>
          <div className="history-editor"><Suspense fallback={<p className="history-empty">{text('正在加载编辑器…', 'Loading editor…')}</p>}><CodeEditor source={draft.source} onChange={source => change({ source })} onPendingChange={setEditorPending} readOnly={!editing || busy} managedFormat onFormat={() => {}} onContextPath={() => {}} onHistory={() => {}} editorRef={editor} diagnostics={[]} language={language} theme={theme} indent={indent} label={text('历史记录内容', 'History content')} /></Suspense></div>
          {deleting ? <div className="history-confirm" role="alert"><span>{text('删除此记录？此操作不可撤销。', 'Delete this record? This cannot be undone.')}</span><button type="button" className="history-button" disabled={busy} onClick={() => setDeleting(false)}>{text('取消', 'Cancel')}</button><button type="button" className="history-button history-danger" disabled={busy} onClick={() => { void remove(); }}>{text('确认删除', 'Delete')}</button></div>
            : <div className="history-actions"><button type="button" className="history-button history-danger" disabled={busy || !draft.entry} onClick={() => setDeleting(true)}><Trash2 size={15} />{text('删除', 'Delete')}</button><span /><button type="button" className="history-button" disabled={busy || !dirty && !editorPending} onClick={revert}>{text('还原', 'Revert')}</button><button type="button" className="history-button history-primary" disabled={busy} onClick={() => { editor.current?.flush(); if (latest.current) { onLoad(latest.current); onClose(); } }}>{text('载入编辑器', 'Load into editor')}</button></div>}
        </> : <div className="history-welcome"><History size={32} /><strong>{text('保存常用 JSON，随时找回', 'Keep useful JSON within reach')}</strong><span>{text('选择一条记录，或点击上方新建记录', 'Select a record or create one above')}</span></div>}
      </section>
    </div>
    {pendingAction && <div className="history-confirm" role="alert"><span>{text('当前修改尚未保存，是否放弃？', 'Discard unsaved changes?')}</span><button type="button" className="history-button" onClick={() => setPendingAction(null)}>{text('继续编辑', 'Keep editing')}</button><button type="button" className="history-button history-danger" onClick={() => { const action = pendingAction; setPendingAction(null); action(); }}>{text('放弃修改', 'Discard')}</button></div>}
    <footer className="history-footer">{error ? <span role="alert">{error}</span> : text('不会上传；清除网站数据会删除历史记录。', 'Never uploaded. Clearing site data deletes saved history.')}</footer>
  </dialog>;
}
