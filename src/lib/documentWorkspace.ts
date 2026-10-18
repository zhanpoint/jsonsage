import { historyStore, availableFileName, fileNameKey, type HistoryStore } from './history';
import { HistorySession, newHistoryDraft, type HistoryDraft } from './historySession';

export type DocumentView = 'code' | 'tree' | 'table' | 'graph' | 'query' | 'diff' | 'jq' | 'types';
export type TabTools = { view: DocumentView; split: boolean; compareSource: string; queryExpression: string; jqExpression: string };
export type DocumentTab = { id: string; pinned: boolean; session: HistorySession; tools: TabTools };
type RememberedTabs = { active?: string; tabs: { record: string; pinned: boolean }[] };
const tools = (): TabTools => ({ view: 'code', split: false, compareSource: '{}', queryExpression: '$.store.book[*].author', jqExpression: '.items[] | {id, title}' });

/** Only document sessions stay alive in background tabs; the UI mounts one editor. */
export class DocumentWorkspace {
  private state: { tabs: DocumentTab[]; activeId: string; ready: boolean };
  private listeners = new Set<() => void>();
  private subscriptions = new Map<string, () => void>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private autoSave = false;
  private paused = new Set<string>();
  private restoring?: Promise<void>;
  constructor(initial: HistoryDraft, private store: Pick<HistoryStore, 'read' | 'save'> = historyStore) {
    const tab = this.create(initial);
    this.state = { tabs: [tab], activeId: tab.id, ready: false };
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<typeof this.state> = {}) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); }
  private create(draft: HistoryDraft, pinned = false): DocumentTab {
    const tab = { id: crypto.randomUUID(), pinned, session: new HistorySession(draft, this.store), tools: tools() };
    this.subscriptions.set(tab.id, tab.session.subscribe(() => { this.schedule(tab); this.publish(); }));
    return tab;
  }
  private schedule(tab: DocumentTab) {
    clearTimeout(this.timers.get(tab.id)); this.timers.delete(tab.id);
    const state = tab.session.snapshot();
    if (!this.autoSave || this.paused.has(tab.id) || !state.dirty || state.saving || state.error || !state.draft?.title.trim() || !state.draft.fileName.trim()) return;
    this.timers.set(tab.id, setTimeout(() => { this.timers.delete(tab.id); void this.save(tab.id).catch(() => {}); }, 700));
  }
  setAutoSave = (enabled: boolean) => {
    this.autoSave = enabled;
    this.state.tabs.forEach(tab => this.schedule(tab));
  };
  activate = (id: string) => {
    if (this.state.activeId !== id && this.state.tabs.some(tab => tab.id === id)) { this.publish({ activeId: id }); }
  };
  open = (draft?: HistoryDraft, pinned = false) => {
    const existing = draft?.entry && this.state.tabs.find(tab => tab.session.snapshot().draft?.entry?.id === draft?.entry?.id);
    if (existing) {
      const current = existing.session.snapshot();
      if (!current.dirty && !current.saving && current.draft?.entry?.revision !== draft!.entry!.revision) existing.session.reset(draft!);
      if (pinned) this.pin(existing.id, true);
      this.activate(existing.id); return existing;
    }
    draft ??= newHistoryDraft();
    if (!draft.entry) {
      const occupied = new Set(this.state.tabs.map(tab => fileNameKey(tab.session.snapshot().draft!.fileName)));
      draft = { ...draft, fileName: availableFileName(draft.fileName, occupied) };
    }
    const tab = this.create(draft, pinned);
    this.publish({ tabs: [...this.state.tabs, tab].sort((a, b) => Number(b.pinned) - Number(a.pinned)), activeId: tab.id }); return tab;
  };
  pin = (id: string, pinned: boolean) => {
    this.publish({ tabs: this.state.tabs.map(tab => tab.id === id ? { ...tab, pinned } : tab).sort((a, b) => Number(b.pinned) - Number(a.pinned)) });
  };
  remove = (id: string, force = false) => {
    const index = this.state.tabs.findIndex(tab => tab.id === id), tab = this.state.tabs[index];
    if (!tab || tab.pinned && !force) return;
    if (tab.session.snapshot().saving) throw new Error('Wait for the current save before closing a tab.');
    clearTimeout(this.timers.get(id)); this.timers.delete(id);
    this.subscriptions.get(id)?.(); this.subscriptions.delete(id);
    const tabs = this.state.tabs.filter(tab => tab.id !== id);
    if (!tabs.length) tabs.push(this.create(newHistoryDraft()));
    this.publish({ tabs, activeId: this.state.activeId === id ? tabs[Math.min(index, tabs.length - 1)].id : this.state.activeId });
  };
  updateTools = (id: string, patch: Partial<TabTools>) => {
    this.publish({ tabs: this.state.tabs.map(tab => tab.id === id ? { ...tab, tools: { ...tab.tools, ...patch } } : tab) });
  };
  withRecord = async (recordId: string, operation: (tab?: DocumentTab) => Promise<void>) => {
    const tab = this.state.tabs.find(tab => tab.session.snapshot().draft?.entry?.id === recordId);
    if (tab) { this.paused.add(tab.id); clearTimeout(this.timers.get(tab.id)); this.timers.delete(tab.id); }
    try { await tab?.session.settled().catch(() => {}); await operation(tab); }
    finally { if (tab) { this.paused.delete(tab.id); if (this.subscriptions.has(tab.id)) this.schedule(tab); } }
  };
  hasUnsaved = () => this.state.tabs.some(tab => { const value = tab.session.snapshot(); return value.dirty || value.saving; });
  save = async (id: string, force = false) => {
    const tab = this.state.tabs.find(tab => tab.id === id);
    if (!tab || this.paused.has(id)) return false;
    await tab.session.save(force);
    return true;
  };
  saveAll = () => Promise.allSettled(this.state.tabs.map(tab => this.save(tab.id)));
  remember = () => JSON.stringify({
    active: this.state.tabs.find(tab => tab.id === this.state.activeId)?.session.snapshot().draft?.entry?.id,
    tabs: this.state.tabs.flatMap(tab => { const entry = tab.session.snapshot().draft?.entry; return entry ? [{ record: entry.id, pinned: tab.pinned }] : []; }),
  } satisfies RememberedTabs);
  restore = (raw: string | null) => this.restoring ??= (async () => {
    try {
      const saved = JSON.parse(raw ?? '{}') as RememberedTabs;
      if (!Array.isArray(saved.tabs)) return;
      const records = await Promise.all(saved.tabs.filter(item => typeof item?.record === 'string').map(async item => ({ item, record: await this.store.read(item.record) })));
      const restored: DocumentTab[] = [];
      const ids = new Set<string>();
      for (const { item, record } of records) {
        if (!record || ids.has(record.id)) continue;
        ids.add(record.id);
        const { source, ...entry } = record;
        restored.push(this.create({ source, title: entry.title, fileName: entry.fileName, jsonc: entry.jsonc, entry }, item.pinned === true));
      }
      if (restored.length) {
        this.state.tabs.forEach(tab => { this.subscriptions.get(tab.id)?.(); this.subscriptions.delete(tab.id); });
        this.publish({ tabs: restored.sort((a, b) => Number(b.pinned) - Number(a.pinned)), activeId: (restored.find(tab => tab.session.snapshot().draft?.entry?.id === saved.active) ?? restored[0]).id });
      }
    } finally { this.publish({ ready: true }); }
  })();
}
