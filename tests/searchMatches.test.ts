import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { SearchQuery } from '@codemirror/search';
import { MATCH_LIMIT, SearchDocument, type SearchRequest, type SearchResult } from '../src/lib/searchMatches';

const document = new SearchDocument();
const query = (search: string, options: Partial<ConstructorParameters<typeof SearchQuery>[0]> = {}) => new SearchQuery({ search, ...options });
function matches(search: SearchQuery) {
  return Array.from({ [Symbol.iterator]: () => document.cursor(search) }, ({ from, to }) => ({ from, to }));
}

document.reset('Name name names\n中文😀 name');
assert.equal(matches(query('name')).length, 4);
assert.equal(matches(query('name', { caseSensitive: true })).length, 3);
assert.equal(matches(query('name', { wholeWord: true })).length, 3);
assert.equal(matches(query('name', { wholeWord: true, caseSensitive: true })).length, 2);
assert.equal(matches(query('中文😀'))[0].to - matches(query('中文😀'))[0].from, 4);
assert.equal(matches(query('name\\s+names', { regexp: true })).length, 1);
assert.equal(matches(query('missing')).length, 0);

// Mirroring disjoint edits must preserve CM offsets, including multi-line UTF-16 content.
let state = EditorState.create({ doc: 'name\n😀 name' });
document.reset(state.doc.toString());
const first = state.update({ changes: [{ from: 0, to: 4, insert: 'title' }, { from: 7, to: 7, insert: '\nname' }] });
document.change(first.changes.toJSON());
state = first.state;
assert.deepEqual(matches(query('name')), [{ from: 9, to: 13 }, { from: 14, to: 18 }]);
const second = state.update({ changes: { from: 0, to: state.doc.length, insert: 'new name' } });
document.change(second.changes.toJSON());
assert.deepEqual(matches(query('name')), [{ from: 4, to: 8 }]);
document.reset('');
assert.deepEqual(matches(query('name')), []);
console.log('Search worker mirror: case/word/regexp, Unicode, disjoint edits, full replacement and reset passed.');

// Exercise the actual worker protocol: count-only payloads, bounded work and stale-job cancellation.
const originalSelf = Object.getOwnPropertyDescriptor(globalThis, 'self');
const replies: SearchResult[] = [];
let receive: (result: SearchResult) => void = () => {};
const worker = {
  onmessage: null as ((event: MessageEvent<SearchRequest>) => void) | null,
  postMessage(result: SearchResult) { replies.push(result); receive(result); },
};
Object.defineProperty(globalThis, 'self', { configurable: true, value: worker });
try {
  await import('../src/workers/search.worker');
  const send = (data: SearchRequest) => worker.onmessage!({ data } as MessageEvent<SearchRequest>);
  const count = (id: number, search: string) => new Promise<SearchResult>(resolve => { receive = resolve; send({ kind: 'count', id, query: query(search) }); });
  send({ kind: 'init', source: 'a '.repeat(MATCH_LIMIT + 1) });
  assert.deepEqual(await count(1, 'a'), { id: 1, count: MATCH_LIMIT, truncated: true });
  send({ kind: 'init', source: 'a '.repeat(MATCH_LIMIT) });
  assert.deepEqual(await count(2, 'a'), { id: 2, count: MATCH_LIMIT, truncated: false });
  send({ kind: 'count', id: 3, query: query('a') });
  send({ kind: 'cancel' });
  send({ kind: 'init', source: 'b b' });
  assert.deepEqual(await count(4, 'b'), { id: 4, count: 2, truncated: false });
  assert.deepEqual(replies.map(reply => reply.id), [1, 2, 4]);
} finally {
  if (originalSelf) Object.defineProperty(globalThis, 'self', originalSelf);
  else Reflect.deleteProperty(globalThis, 'self');
}
console.log('Search worker: compact counts, exact cap boundary and cancellation passed.');
