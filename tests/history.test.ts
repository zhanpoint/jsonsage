import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { deleteDB, openDB, unwrap } from 'idb';
import { HistoryConflict, HistoryStore, type HistoryCursor } from '../src/lib/history';

const name = `history-test-${crypto.randomUUID()}`;
const store = new HistoryStore(name), otherTab = new HistoryStore(name);
const source = '// confidential\n{"id":18446744073709551615,"decimal":1.23000,"broken":';
const first = await store.save({ title: ' First ', fileName: ' data.jsonc ', jsonc: true, source });
assert.equal(first.title, 'First'); assert.equal(first.fileName, 'data.jsonc');
assert.equal((await store.read(first.id))?.source, source, 'Save raw text without parsing, normalizing or rounding numbers');
assert.equal((await otherTab.read(first.id))?.source, source, 'Saved records are shared by same-origin tabs');
await store.close();
assert.equal((await store.read(first.id))?.source, source, 'Reopening the database preserves saved JSON');

const renamed = await store.save({ title: 'Renamed', fileName: 'archive.jsonc', jsonc: true }, first);
assert.equal((await store.read(first.id))?.source, source, 'Metadata-only updates preserve the content');
assert.equal(renamed.revision, first.revision + 1);
assert.equal(renamed.createdAt, first.createdAt);
assert.deepEqual((await store.list('ARCHIVE')).items.map(item => item.id), [first.id]);
assert.deepEqual((await store.list('renamed')).items.map(item => item.id), [first.id]);
await assert.rejects(otherTab.save({ title: 'Stale', fileName: 'stale.json', jsonc: false, source: '{}' }, first), HistoryConflict);
await assert.rejects(otherTab.remove(first), HistoryConflict);
assert.equal((await store.read(first.id))?.title, 'Renamed', 'Stale updates and deletes cannot overwrite another tab');
const changed = await store.save({ title: 'Edited', fileName: 'edited.json', jsonc: false, source: '' }, renamed);
assert.equal((await store.read(first.id))?.source, '', 'Empty text is a valid history snapshot');

// Equal timestamps must paginate deterministically by the compound date/id index.
const originalNow = Date.now;
Date.now = () => 2_000_000_000_000;
try {
  for (let i = 0; i < 105; i++) await store.save({ title: `Batch ${i}`, fileName: `batch-${i}.json`, jsonc: false, source: `{"index":${i}}` });
} finally { Date.now = originalNow; }
let cursor: HistoryCursor | undefined;
const ids: string[] = [];
do {
  const page = await store.list('batch', cursor);
  assert.ok(page.items.length <= 50);
  assert.ok(page.items.every(item => !Object.hasOwn(item, 'source')), 'Lists contain metadata only');
  ids.push(...page.items.map(item => item.id)); cursor = page.next;
} while (cursor);
assert.equal(ids.length, 105); assert.equal(new Set(ids).size, 105, 'No missing or duplicate records across pages');
assert.deepEqual((await store.list('does-not-exist')).items, []);

// Simulate a quota failure on the metadata request AFTER the content was written.
// Both stores must roll back together, preserving the previously saved document.
const db = await openDB(name);
const native = unwrap(db.transaction('entries').store);
const prototype = Object.getPrototypeOf(native) as IDBObjectStore;
const put = prototype.put;
prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
  if (this.name === 'entries') throw new DOMException('Full', 'QuotaExceededError');
  return put.apply(this, args);
};
try {
  await assert.rejects(store.save({ title: 'Failed', fileName: 'failed.json', jsonc: false, source: 'new content' }, changed), { name: 'QuotaExceededError' });
} finally { prototype.put = put; db.close(); }
const retained = await store.read(first.id);
assert.equal(retained?.source, ''); assert.equal(retained?.revision, changed.revision);
await store.remove(changed);
assert.equal(await store.read(first.id), undefined);
await assert.rejects(store.save({ title: 'Missing', fileName: 'missing.json', jsonc: false, source: '{}' }, changed), HistoryConflict);
await assert.rejects(store.save({ title: ' ', fileName: 'a.json', jsonc: false, source: '{}' }));
await assert.rejects(store.save({ title: 'A', fileName: 'a.json', jsonc: false }));
const connection = await openDB(name);
assert.equal(await connection.get('contents', first.id), undefined, 'Deleting a record deletes its content as well');
connection.close(); await store.close(); await otherTab.close(); await deleteDB(name);
console.log('Browser history CRUD, raw-text preservation, pagination, search, cross-tab conflicts and atomic quota recovery checks passed.');
