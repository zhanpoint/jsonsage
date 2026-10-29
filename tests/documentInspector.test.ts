import assert from 'node:assert/strict';
import { DocumentInspector, type InspectorRequest, type InspectorResponse } from '../src/lib/documentInspector';
import { InspectorClient } from '../src/lib/inspectorClient';

const inspector = new DocumentInspector();
const source = '{"users":[{"status":1,"customer":{"name":"甲"}},{"status":"1","customer":{"name":"乙"}},{"status":null},{},{"status":9007199254740993},{"status":1.0},null]}';
inspector.sync(source, 1);
const next = await inspector.query({ kind: 'locate', path: ['users', 0, 'customer', 'name'], direction: 1 });
assert.deepEqual(next?.path, ['users', 1, 'customer', 'name']);
assert.equal(source.slice(next!.offset, next!.offset + next!.length), '"乙"');
assert.deepEqual((await inspector.query({ kind: 'locate', path: ['users', 1, 'customer', 'name'], direction: 1 }))?.path, ['users', 2]);
assert.equal(await inspector.query({ kind: 'locate', path: ['users', 0], direction: -1 }), null);
assert.equal(await inspector.query({ kind: 'locate', path: ['users', 6], direction: 1 }), null);
assert.deepEqual(await inspector.query({ kind: 'preview', path: ['users', 0, 'customer', 'name'] }), { text: '甲' });
const start = source.indexOf('甲');
inspector.change(start, start + 1, '更新', 2);
assert.deepEqual(await inspector.query({ kind: 'preview', path: ['users', 0, 'customer', 'name'] }), { text: '更新' });
inspector.sync('// comment\n{"a:b":{"quote\\\"":"line\\n第二行"},"url":"https://example.com/a?x=1"}', 3);
assert.deepEqual(await inspector.query({ kind: 'preview', path: ['a:b', 'quote"'] }), { text: 'line\n第二行' });
inspector.sync('{"name":"a"}\n{"name":null}\n{}\n', 4);
assert.equal((await inspector.query({ kind: 'locate', path: [0, 'name'] }))?.offset, 8);
const pending = inspector.query({ kind: 'preview', path: [999, 'x'] });
inspector.sync('{}', 7);
await assert.rejects(pending, { name: 'AbortError' });
inspector.sync(JSON.stringify({ text: '大'.repeat(80_000) }), 8);
const boundedText = await inspector.query({ kind: 'preview', path: ['text'] });
assert.equal(boundedText.text?.length, 50_000);
assert.equal(boundedText.length, 80_000);

// Verify transport lifecycle and payloads independently of browser rendering.
const originalWorker = globalThis.Worker;
const messages: InspectorRequest[] = [];
let instance: FakeWorker;
let creations = 0, terminations = 0;
class FakeWorker {
  onmessage: ((event: MessageEvent<InspectorResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { instance = this; creations++; }
  postMessage(message: InspectorRequest) { messages.push(message); }
  terminate() { terminations++; }
}
globalThis.Worker = FakeWorker as unknown as typeof Worker;
try {
  const client = new InspectorClient();
  client.sync('{"x":"first"}');
  assert.equal(creations, 0);
  const first = client.query({ kind: 'preview', path: ['x'] });
  const request = messages.at(-1)!;
  if (request.kind !== 'query') throw new Error('query expected');
  instance!.onmessage!({ data: { id: request.id, revision: request.revision, result: { text: 'first' } } } as MessageEvent<InspectorResponse>);
  assert.deepEqual(await first, { text: 'first' });
  client.sync('{"x":"next"}');
  const change = messages.at(-1)!;
  assert.equal(change.kind, 'change');
  if (change.kind === 'change') assert.equal(change.insert, 'nex');
  const stale = client.query({ kind: 'preview', path: ['x'] });
  client.cancel('preview');
  await assert.rejects(stale, { name: 'AbortError' });
  assert.equal(creations, 1);
  assert.equal(messages.filter(m => m.kind === 'sync').length, 1);
  client.dispose();
  assert.equal(terminations, 1);
} finally { globalThis.Worker = originalWorker; }
console.log('Document inspector: preview, navigation, JSONL, cancellation and incremental transport passed.');
