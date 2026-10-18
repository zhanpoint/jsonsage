import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface HistoryEntry {
  id: string; title: string; fileName: string; jsonc: boolean;
  createdAt: number; updatedAt: number; revision: number; characters: number; pinned: number; nameKey: string;
}
export interface SavedDocument { source: string; fileName: string; jsonc: boolean }
export type HistoryCursor = [number, number, string];
interface HistoryDatabase extends DBSchema {
  entries: { key: string; value: HistoryEntry; indexes: { recent: HistoryCursor; updated: [number, string]; name: string } };
  contents: { key: string; value: string };
}
export const fileNameKey = (name: string) => name.trim().normalize('NFC').toLowerCase();
export function availableFileName(name: string, occupied: ReadonlySet<string>) {
  const clean = name.trim(), dot = clean.lastIndexOf('.');
  const stem = dot > 0 ? clean.slice(0, dot) : clean, extension = dot > 0 ? clean.slice(dot) : '';
  let candidate = clean, index = 2;
  while (occupied.has(fileNameKey(candidate))) candidate = `${stem} (${index++})${extension}`;
  return candidate;
}
export class FileNameConflict extends Error {
  constructor() { super('A history record already uses this filename.'); }
}
export class HistoryConflict extends Error {
  constructor() { super('This record was changed or deleted in another tab.'); }
}
export type HistoryOperation = 'save' | 'read' | 'update' | 'delete';
export function historyError(cause: unknown, zh: boolean, operation: HistoryOperation = 'save') {
  if (cause instanceof FileNameConflict) return zh ? '文件名已存在，请使用其他名称。' : 'This filename already exists. Choose another name.';
  if (cause instanceof HistoryConflict) return zh ? '记录已在其他标签页修改或删除，请重新载入后再编辑。' : 'This record changed in another tab. Reload it before editing.';
  if (operation === 'delete') return zh ? '删除失败，请检查网站存储权限后重试。' : 'Could not delete. Check site storage permissions and try again.';
  if (operation === 'read') return zh ? '读取失败，请检查网站存储权限后重试。' : 'Could not read history. Check site storage permissions and try again.';
  if (operation === 'update') return zh ? '更新记录失败，请检查名称和网站存储权限后重试。' : 'Could not update the record. Check its name and site storage permissions.';
  if (cause instanceof DOMException && cause.name === 'QuotaExceededError') return zh ? '浏览器存储空间不足，未保存。请删除不需要的记录后重试。' : 'Browser storage is full. Delete unneeded records and try again.';
  return zh ? '保存失败，请检查标题、文件名和网站存储权限。修改仍保留在编辑器中。' : 'Could not save. Check the title, filename and site storage permissions. Your edits remain in the editor.';
}

/** Metadata is separate so listing and renaming never copy large JSON bodies. */
export class HistoryStore {
  private connection?: Promise<IDBPDatabase<HistoryDatabase>>;
  constructor(private readonly name = 'jsonsage-history') {}
  private database() {
    return this.connection ??= openDB<HistoryDatabase>(this.name, 3, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (!oldVersion) {
          db.createObjectStore('entries', { keyPath: 'id' });
          db.createObjectStore('contents');
        }
        const entries = tx.objectStore('entries');
        if (entries.indexNames.contains('updated')) entries.deleteIndex('updated');
        if (!entries.indexNames.contains('recent')) entries.createIndex('recent', ['pinned', 'updatedAt', 'id']);
        if (oldVersion < 3) {
          const used = new Set<string>();
          let cursor = await entries.openCursor();
          while (cursor) {
            const value = cursor.value;
            const fileName = availableFileName(value.fileName, used), nameKey = fileNameKey(fileName);
            used.add(nameKey);
            await cursor.update({ ...value, fileName, nameKey, pinned: value.pinned ?? 0 });
            cursor = await cursor.continue();
          }
          entries.createIndex('name', 'nameKey', { unique: true });
        }
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
    let cursor = await db.transaction('entries').store.index('recent').openCursor(after ? IDBKeyRange.upperBound(after, true) : null, 'prev');
    while (cursor) {
      const entry = cursor.value;
      if (!query || `${entry.title}\n${entry.fileName}`.toLocaleLowerCase().includes(query)) {
        if (items.length === 50) {
          const last = items[items.length - 1];
          return { items, next: [last.pinned, last.updatedAt, last.id] as HistoryCursor };
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
  async save(input: { title: string; fileName: string; jsonc: boolean; source?: string; pinned?: number }, previous?: Pick<HistoryEntry, 'id' | 'revision'>) {
    const title = input.title.trim();
    let fileName = input.fileName.trim();
    if (!title || !fileName || (!previous && input.source === undefined)) throw new Error('A title, filename and content are required.');
    const db = await this.database();
    const tx = db.transaction(['entries', 'contents'], 'readwrite');
    try {
      const current = previous ? await tx.objectStore('entries').get(previous.id) : undefined;
      if (previous && current?.revision !== previous.revision) throw new HistoryConflict();
      const names = tx.objectStore('entries').index('name');
      const owner = await names.getKey(fileNameKey(fileName));
      if (owner && owner !== current?.id) {
        if (previous) throw new FileNameConflict();
        const occupied = new Set<string>();
        let cursor = await names.openKeyCursor();
        while (cursor) { occupied.add(cursor.key); cursor = await cursor.continue(); }
        fileName = availableFileName(fileName, occupied);
      }
      const now = Date.now();
      const entry: HistoryEntry = {
        id: current?.id ?? crypto.randomUUID(), title, fileName, nameKey: fileNameKey(fileName), jsonc: input.jsonc,
        createdAt: current?.createdAt ?? now, updatedAt: now,
        revision: (current?.revision ?? 0) + 1, characters: input.source?.length ?? current!.characters,
        pinned: input.pinned === undefined ? current?.pinned ?? 0 : input.pinned ? 1 : 0,
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
