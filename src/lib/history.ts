import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface HistoryEntry {
  id: string; title: string; fileName: string; jsonc: boolean;
  createdAt: number; updatedAt: number; revision: number; characters: number;
}
export interface SavedDocument { source: string; fileName: string; jsonc: boolean }
export type HistoryCursor = [number, string];
interface HistoryDatabase extends DBSchema {
  entries: { key: string; value: HistoryEntry; indexes: { updated: HistoryCursor } };
  contents: { key: string; value: string };
}
export class HistoryConflict extends Error {
  constructor() { super('This record was changed or deleted in another tab.'); }
}

/** Metadata is separate so listing and renaming never copy large JSON bodies. */
export class HistoryStore {
  private connection?: Promise<IDBPDatabase<HistoryDatabase>>;
  constructor(private readonly name = 'jsonsage-history') {}
  private database() {
    return this.connection ??= openDB<HistoryDatabase>(this.name, 1, {
      upgrade(db) {
        db.createObjectStore('entries', { keyPath: 'id' }).createIndex('updated', ['updatedAt', 'id']);
        db.createObjectStore('contents');
      },
      blocking: () => { void this.close(); },
      terminated: () => { this.connection = undefined; },
    }).catch(error => { this.connection = undefined; throw error; });
  }
  async close() {
    const connection = this.connection; this.connection = undefined;
    (await connection)?.close();
  }
  async list(search = '', after?: HistoryCursor) {
    const db = await this.database();
    const query = search.trim().toLocaleLowerCase();
    const items: HistoryEntry[] = [];
    let cursor = await db.transaction('entries').store.index('updated').openCursor(after ? IDBKeyRange.upperBound(after, true) : null, 'prev');
    while (cursor) {
      const entry = cursor.value;
      if (!query || `${entry.title}\n${entry.fileName}`.toLocaleLowerCase().includes(query)) {
        if (items.length === 50) {
          const last = items[items.length - 1];
          return { items, next: [last.updatedAt, last.id] as HistoryCursor };
        }
        items.push(entry);
      }
      cursor = await cursor.continue();
    }
    return { items, next: undefined };
  }
  async read(id: string) {
    const db = await this.database();
    const tx = db.transaction(['entries', 'contents']);
    const [entry, source] = await Promise.all([tx.objectStore('entries').get(id), tx.objectStore('contents').get(id)]);
    await tx.done;
    return entry && source !== undefined ? { ...entry, source } : undefined;
  }
  async save(input: { title: string; fileName: string; jsonc: boolean; source?: string }, previous?: Pick<HistoryEntry, 'id' | 'revision'>) {
    const title = input.title.trim(), fileName = input.fileName.trim();
    if (!title || !fileName || (!previous && input.source === undefined)) throw new Error('A title, filename and content are required.');
    const db = await this.database();
    const tx = db.transaction(['entries', 'contents'], 'readwrite');
    try {
      const current = previous ? await tx.objectStore('entries').get(previous.id) : undefined;
      if (previous && current?.revision !== previous.revision) throw new HistoryConflict();
      const now = Date.now();
      const entry: HistoryEntry = {
        id: current?.id ?? crypto.randomUUID(), title, fileName, jsonc: input.jsonc,
        createdAt: current?.createdAt ?? now, updatedAt: now,
        revision: (current?.revision ?? 0) + 1, characters: input.source?.length ?? current!.characters,
      };
      if (input.source !== undefined) await tx.objectStore('contents').put(input.source, entry.id);
      await tx.objectStore('entries').put(entry);
      await tx.done;
      return entry;
    } catch (error) {
      try { tx.abort(); } catch { /* A failed request may have already aborted the transaction. */ }
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async remove(entry: Pick<HistoryEntry, 'id' | 'revision'>) {
    const db = await this.database();
    const tx = db.transaction(['entries', 'contents'], 'readwrite');
    try {
      const current = await tx.objectStore('entries').get(entry.id);
      if (current?.revision !== entry.revision) throw new HistoryConflict();
      await Promise.all([tx.objectStore('entries').delete(entry.id), tx.objectStore('contents').delete(entry.id)]);
      await tx.done;
    } catch (error) {
      try { tx.abort(); } catch { /* The transaction may have already finished. */ }
      await tx.done.catch(() => {});
      throw error;
    }
  }
}
export const historyStore = new HistoryStore();
