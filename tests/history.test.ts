import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { deleteDB, openDB, unwrap } from 'idb';
import { HistoryConflict, HistoryStore, historyError, type HistoryCursor } from '../src/lib/history';
import { HistorySession, newHistoryDraft } from '../src/lib/historySession';

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

const sessionName = `history-session-${crypto.randomUUID()}`, sessionStore = new HistoryStore(sessionName);
const session = new HistorySession(newHistoryDraft(), sessionStore);
await session.save();
assert.equal((await sessionStore.list()).items.length, 0, 'An untouched new draft does not prompt or create an empty record');
assert.equal(session.snapshot().dirty, false);
await session.save(true);
const savedId = session.snapshot().draft!.entry!.id;
await session.save(true);
assert.equal((await sessionStore.list()).items.length, 1, 'Repeated explicit saves update the same record');
session.change({ source });
await session.save();
assert.equal((await sessionStore.read(savedId))?.source, source, 'Auto-save preserves invalid JSON and large integers verbatim');
session.change({ title: 'Renamed automatically' });
await session.save();
assert.equal((await sessionStore.read(savedId))?.source, source);
session.change({ source: 'unsaved manual change' });
assert.equal((await sessionStore.read(savedId))?.source, source, 'Changes remain local to the session until a save is requested');
session.reset({ ...session.snapshot().draft!, source });
assert.equal(session.snapshot().draft?.source, source);
assert.equal(session.snapshot().dirty, false);

let release!: () => void;
const gate = new Promise<void>(resolve => { release = resolve; });
let writes = 0;
const concurrent = new HistorySession(newHistoryDraft(), {
  async save(input, previous) { if (++writes === 1) await gate; return sessionStore.save(input, previous); },
});
concurrent.change({ source: 'first' });
const pending = concurrent.save();
concurrent.change({ source: 'latest', title: 'Changed during save' });
assert.equal(concurrent.save(), pending, 'Closing or saving again awaits the same serialized write');
assert.throws(() => concurrent.reset(newHistoryDraft()), /Wait for the current save/);
release(); await pending;
assert.equal(writes, 2);
const finalDraft = concurrent.snapshot().draft!;
assert.equal((await sessionStore.read(finalDraft.entry!.id))?.source, 'latest');
assert.equal(finalDraft.title, 'Changed during save');
assert.equal(concurrent.snapshot().dirty, false);
assert.equal((await sessionStore.list()).items.length, 2, 'Edits during first save must not create duplicate records');

const failure = new DOMException('Full', 'QuotaExceededError');
const failed = new HistorySession(newHistoryDraft(), { async save() { throw failure; } });
failed.change({ source: 'keep this edit' });
await assert.rejects(failed.save(), { name: 'QuotaExceededError' });
assert.equal(failed.snapshot().draft?.source, 'keep this edit');
assert.equal(failed.snapshot().dirty, true);
assert.equal(failed.snapshot().saving, false);
assert.equal(failed.snapshot().error, failure);

const stale = new HistorySession(finalDraft, sessionStore);
concurrent.change({ source: 'newer tab' }); await concurrent.save();
stale.change({ source: 'stale tab' });
await assert.rejects(stale.save(), HistoryConflict);
assert.equal(stale.snapshot().dirty, true);
assert.equal((await sessionStore.read(finalDraft.entry!.id))?.source, 'newer tab');
await sessionStore.close(); await deleteDB(sessionName);
console.log('Browser history CRUD, raw-text preservation, pagination, search, cross-tab conflicts and atomic quota recovery checks passed.');
console.log('History sessions preserve concurrent edits, serialize saves, avoid duplicate records and retain drafts after failures.');

const legacyName = `legacy-${crypto.randomUUID()}`;
const legacy = await openDB(legacyName, 1, { upgrade(db) { db.createObjectStore('entries', { keyPath: 'id' }).createIndex('updated', ['updatedAt', 'id']); db.createObjectStore('contents'); } });
const legacyEntry = { id: 'legacy', title: 'Original', fileName: 'old.json', jsonc: false, createdAt: 1, updatedAt: 2, revision: 3, characters: source.length };
await legacy.put('entries', legacyEntry); await legacy.put('contents', source, 'legacy'); legacy.close();
const migrated = new HistoryStore(legacyName);
assert.deepEqual(await migrated.read('legacy'), { ...legacyEntry, pinned: 0, nameKey: 'old.json', source });
const oldEntry = (await migrated.list()).items[0];
const pinnedEntry = await migrated.save({ ...oldEntry, pinned: 1 }, oldEntry);
for (let i = 0; i < 55; i++) await migrated.save({ title: `Recent ${i}`, fileName: `${i}.json`, source: '{}', jsonc: false });
const pinnedPage = await migrated.list();
assert.equal(pinnedPage.items[0].id, 'legacy');
assert.equal((await migrated.list('', pinnedPage.next)).items.length, 6);
assert.equal((await migrated.read('legacy'))?.source, source);
const dirtySession = new HistorySession({ ...pinnedEntry, entry: pinnedEntry, source }, migrated);
dirtySession.change({ source: 'manual unsaved source' });
const metadata = await migrated.save({ ...pinnedEntry, title: 'New title' }, pinnedEntry);
dirtySession.syncEntry(metadata);
assert.equal(dirtySession.snapshot().draft?.source, 'manual unsaved source');
assert.equal(dirtySession.snapshot().draft?.title, 'New title');
assert.equal(dirtySession.snapshot().dirty, true);
await dirtySession.save();
assert.equal((await migrated.read('legacy'))?.source, 'manual unsaved source');
await migrated.close(); await deleteDB(legacyName);

const { DocumentWorkspace } = await import('../src/lib/documentWorkspace');
const { sampleDocument } = await import('../src/lib/sampleDocument');
const sampleWorkspace = new DocumentWorkspace(sampleDocument());
await sampleWorkspace.restore(null);
const sample = sampleWorkspace.snapshot().tabs[0].session.snapshot().draft!;
assert.equal(sample.fileName, 'sample.json');
assert.equal(JSON.parse(sample.source).name, 'JsonSage');
assert.equal(sample.jsonc, false);
const tabsName = `tabs-${crypto.randomUUID()}`, tabStore = new HistoryStore(tabsName);
const workspace = new DocumentWorkspace(newHistoryDraft(), tabStore);
await workspace.restore(null);
const firstTab = workspace.snapshot().tabs[0], oldSnapshot = workspace.snapshot();
firstTab.session.change({ source: 'first private body' });
const secondTab = workspace.open();
assert.equal(oldSnapshot.tabs.length, 1, 'Workspace snapshots remain immutable');
assert.notEqual(firstTab.session.snapshot().draft?.fileName, secondTab.session.snapshot().draft?.fileName);
secondTab.session.change({ source: 'second private body' });
workspace.activate(firstTab.id);
assert.equal(firstTab.session.snapshot().draft?.source, 'first private body');
assert.equal(secondTab.session.snapshot().draft?.source, 'second private body');
workspace.updateTools(firstTab.id, { view: 'tree' });
assert.equal(secondTab.tools.view, 'code');
await workspace.saveAll();
workspace.pin(secondTab.id, true); workspace.remove(secondTab.id);
assert.equal(workspace.snapshot().tabs.length, 2, 'Fixed tabs cannot be closed accidentally');
assert.equal(workspace.snapshot().tabs[0].id, secondTab.id);
const sameTab = workspace.open(firstTab.session.snapshot().draft!);
assert.equal(sameTab.id, firstTab.id); assert.equal(workspace.snapshot().tabs.length, 2);
const remembered = workspace.remember();
assert.equal(remembered.includes('private body'), false, 'Only record references are kept in localStorage');
const restoredWorkspace = new DocumentWorkspace(newHistoryDraft(), tabStore);
await restoredWorkspace.restore(remembered);
assert.equal(restoredWorkspace.snapshot().tabs.length, 2);
assert.equal(restoredWorkspace.snapshot().tabs[0].pinned, true);
assert.equal(restoredWorkspace.snapshot().tabs.find(tab => tab.id === restoredWorkspace.snapshot().activeId)?.session.snapshot().draft?.source, 'first private body');
workspace.setAutoSave(true);
secondTab.session.change({ source: 'background autosaved' });
await new Promise(resolve => setTimeout(resolve, 850));
await secondTab.session.settled();
assert.equal((await tabStore.read(secondTab.session.snapshot().draft!.entry!.id))?.source, 'background autosaved');
workspace.setAutoSave(false);
workspace.remove(secondTab.id, true); workspace.remove(firstTab.id);
assert.equal(workspace.snapshot().tabs.length, 1);
assert.equal(workspace.snapshot().tabs[0].session.snapshot().draft?.source, '{}');
await tabStore.close(); await deleteDB(tabsName);
console.log('Legacy migration, pinned pagination, independent tabs, metadata synchronization, restore and background autosave checks passed.');

// Visibility-triggered saves must not race a record deletion after its DB commit.
const deleteName = `delete-race-${crypto.randomUUID()}`, deleteStore = new HistoryStore(deleteName);
let releaseDeleteSave!: () => void;
const deleteSaveGate = new Promise<void>(resolve => { releaseDeleteSave = resolve; });
let deleteWrites = 0;
const deletingWorkspace = new DocumentWorkspace(newHistoryDraft(), {
  read: id => deleteStore.read(id),
  async save(input, previous) { if (++deleteWrites > 1) await deleteSaveGate; return deleteStore.save(input, previous); },
});
await deletingWorkspace.restore(null);
const deletingTab = deletingWorkspace.snapshot().tabs[0];
await deletingTab.session.save(true);
const deletingEntry = deletingTab.session.snapshot().draft!.entry!;
deletingTab.session.change({ source: 'unsaved edits before delete' });
let backgroundSave: Promise<unknown> | undefined;
let deletionError: unknown;
try {
  await deletingWorkspace.withRecord(deletingEntry.id, async tab => {
    await deleteStore.remove(tab!.session.snapshot().draft!.entry!);
    assert.equal(await deletingWorkspace.save(tab!.id, true), false, 'Manual save also respects an in-progress deletion');
    backgroundSave = deletingWorkspace.saveAll();
    deletingWorkspace.remove(tab!.id, true);
  });
} catch (error) { deletionError = error; }
finally { releaseDeleteSave(); await backgroundSave; }
assert.equal(deletionError, undefined, 'A background save must not interrupt deletion after the database commit');
assert.equal(await deleteStore.read(deletingEntry.id), undefined);
assert.equal(deletingWorkspace.snapshot().tabs.some(tab => tab.id === deletingTab.id), false);
await deleteStore.close(); await deleteDB(deleteName);

assert.match(historyError(new Error('storage unavailable'), true, 'delete'), /^删除失败/);
assert.doesNotMatch(historyError(new Error('storage unavailable'), true, 'delete'), /保存失败/);

const failedSaveName = `delete-after-failure-${crypto.randomUUID()}`, failedSaveStore = new HistoryStore(failedSaveName);
let rejectWrite!: (error: unknown) => void;
const blockedWrite = new Promise<never>((_resolve, reject) => { rejectWrite = reject; });
let failWrites = false;
const failedSaveWorkspace = new DocumentWorkspace(newHistoryDraft(), {
  read: id => failedSaveStore.read(id),
  save: (input, previous) => failWrites ? blockedWrite : failedSaveStore.save(input, previous),
});
await failedSaveWorkspace.restore(null);
const failedSaveTab = failedSaveWorkspace.snapshot().tabs[0];
await failedSaveWorkspace.save(failedSaveTab.id, true);
const failedSaveEntry = failedSaveTab.session.snapshot().draft!.entry!;
failedSaveTab.session.change({ source: 'not persisted' }); failWrites = true;
const writeFailure = failedSaveWorkspace.save(failedSaveTab.id).catch(() => {});
const deletion = failedSaveWorkspace.withRecord(failedSaveEntry.id, async tab => {
  await failedSaveStore.remove(tab!.session.snapshot().draft!.entry!);
  failedSaveWorkspace.remove(tab!.id, true);
});
rejectWrite(new DOMException('Full', 'QuotaExceededError'));
await Promise.all([writeFailure, deletion]);
assert.equal(await failedSaveStore.read(failedSaveEntry.id), undefined, 'A failed pending save must not prevent deleting a record to free storage');
assert.equal(failedSaveWorkspace.snapshot().tabs.some(tab => tab.id === failedSaveTab.id), false);
await failedSaveStore.close(); await deleteDB(failedSaveName);
console.log('Deletion excludes background/manual saves, closes the last tab, survives pending save failures and reports operation-specific errors.');

const { FileNameConflict, fileNameKey } = await import('../src/lib/history');
const uniqueName = `unique-${crypto.randomUUID()}`, uniqueStore = new HistoryStore(uniqueName);
const originals = await Promise.all(['bom.json', 'bom.json', 'BOM.json'].map(fileName => uniqueStore.save({ title: 'BOM', fileName, jsonc: false, source: fileName })));
assert.equal(new Set(originals.map(entry => entry.nameKey)).size, 3, 'Concurrent imports receive unique names within the write transaction');
await assert.rejects(uniqueStore.save({ ...originals[1], fileName: ' BOM.json ' }, originals[1]), FileNameConflict);
assert.equal((await uniqueStore.read(originals[1].id))?.source, 'bom.json');
assert.equal(fileNameKey(' e\u0301.json '), fileNameKey('é.JSON'));
await uniqueStore.close(); await deleteDB(uniqueName);

const duplicateName = `duplicates-v2-${crypto.randomUUID()}`;
const v2 = await openDB(duplicateName, 2, { upgrade(db) { db.createObjectStore('entries', { keyPath: 'id' }).createIndex('recent', ['pinned', 'updatedAt', 'id']); db.createObjectStore('contents'); } });
for (const id of ['a','b']) { await v2.put('entries', { ...legacyEntry, id, fileName: 'bom.json', pinned: 1 }); await v2.put('contents', `source-${id}`, id); }
v2.close();
const upgradeStore = new HistoryStore(duplicateName);
const upgraded = (await upgradeStore.list()).items;
assert.equal(new Set(upgraded.map(entry => entry.fileName)).size, 2);
assert.equal((await upgradeStore.read('a'))?.source, 'source-a');
assert.equal((await upgradeStore.read('b'))?.source, 'source-b');
assert.ok(upgraded.every(entry => entry.pinned === 1));
await upgradeStore.close(); await deleteDB(duplicateName);
console.log('Unique filenames, concurrent imports, rename rejection and lossless migration of duplicate names passed.');
