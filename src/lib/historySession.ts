import { historyStore, type HistoryEntry, type HistoryStore, type SavedDocument } from './history';

export type HistoryDraft = SavedDocument & { title: string; entry?: HistoryEntry };
export const newHistoryDraft = (document: SavedDocument = { source: '{}', fileName: 'untitled.json', jsonc: false }): HistoryDraft => ({ ...document, title: document.fileName.replace(/\.[^.]+$/, '') || 'JSON' });
const equal = (a: HistoryDraft | null, b: HistoryDraft | null) => a === b || !!a && !!b && a.source === b.source && a.title === b.title && a.fileName === b.fileName && a.jsonc === b.jsonc;

/** One editing session owns one record. Serialize writes without blocking typing. */
export class HistorySession {
  private state: { draft: HistoryDraft | null; dirty: boolean; saving: boolean; error: unknown };
  private saved: HistoryDraft | null;
  private pending?: Promise<void>;
  private listeners = new Set<() => void>();
  constructor(initial: HistoryDraft | null, private store: Pick<HistoryStore, 'save'> = historyStore) {
    this.saved = initial;
    this.state = { draft: initial, dirty: false, saving: false, error: null };
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<typeof this.state>) {
    this.state = { ...this.state, ...patch };
    this.state.dirty = !equal(this.state.draft, this.saved);
    this.listeners.forEach(listener => listener());
  }
  change = (patch: Partial<SavedDocument & { title: string }>) => {
    if (this.state.draft) this.publish({ draft: { ...this.state.draft, ...patch }, error: null });
  };
  reset = (draft: HistoryDraft | null) => {
    if (this.pending) throw new Error('Wait for the current save before replacing a document.');
    this.saved = draft;
    this.publish({ draft, error: null });
  };
  settled = () => this.pending ?? Promise.resolve();
  syncEntry = (entry: HistoryEntry) => {
    const value = this.state.draft;
    if (!value || value.entry?.id !== entry.id || this.pending) return;
    const fields = { title: value.title === this.saved?.title ? entry.title : value.title, fileName: value.fileName === this.saved?.fileName ? entry.fileName : value.fileName };
    if (this.saved) this.saved = { ...this.saved, title: entry.title, fileName: entry.fileName, entry };
    this.publish({ draft: { ...value, ...fields, entry }, error: null });
  };
  save = (force = false): Promise<void> => {
    if (this.pending) return this.pending;
    if (!this.state.draft || !this.state.dirty && (!force || this.state.draft.entry)) return Promise.resolve();
    this.publish({ saving: true, error: null });
    this.pending = this.write().catch(error => { this.publish({ error }); throw error; }).finally(() => {
      this.pending = undefined;
      this.publish({ saving: false });
    });
    return this.pending;
  };
  private async write() {
    do {
      const value = this.state.draft!;
      const entry = await this.store.save({ ...value, source: value.entry && value.source === this.saved?.source ? undefined : value.source }, value.entry);
      this.saved = { ...value, title: entry.title, fileName: entry.fileName, entry };
      // A completed write must never replace newer edits made while IndexedDB was busy.
      const current = this.state.draft!;
      this.publish({ draft: current === value ? this.saved : {
        ...current, entry,
        fileName: current.fileName === value.fileName ? entry.fileName : current.fileName,
        title: current.title === value.title ? entry.title : current.title,
      } });
    } while (this.state.dirty);
  }
}
