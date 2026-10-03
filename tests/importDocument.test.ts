import assert from 'node:assert/strict';
import { fetchDocument, readLocalDocument, MAX_IMPORT_BYTES } from '../src/lib/importDocument';

const source = '{"name":"中文😀","id":18446744073709551615}';
const bytes = new TextEncoder().encode(source);
assert.equal(await readLocalDocument({ size: bytes.length, arrayBuffer: async () => bytes.buffer }), source);
await assert.rejects(readLocalDocument({ size: MAX_IMPORT_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) }), /FILE_TOO_LARGE/);
await assert.rejects(readLocalDocument({ size: 1, arrayBuffer: async () => new Uint8Array([0xff]).buffer }), TypeError);

const originalFetch = globalThis.fetch;
try {
  const boundary = bytes.indexOf(0xe4) + 1;
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.credentials, 'omit'); assert.equal(init?.referrerPolicy, 'no-referrer');
    assert.equal((init?.headers as Headers).get('Accept'), 'application/json');
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(bytes.slice(0, boundary)); controller.enqueue(bytes.slice(boundary)); controller.close();
    } }));
  };
  assert.equal(await fetchDocument('curl https://example.com/test.json -H "Accept: application/json"', new AbortController().signal), source, 'UTF-8 characters split across chunks must remain intact');
  globalThis.fetch = async () => new Response(new Uint8Array([0xff]));
  await assert.rejects(fetchDocument('https://example.com/test.json', new AbortController().signal), TypeError);
  let cancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Length': String(MAX_IMPORT_BYTES + 1) } });
  await assert.rejects(fetchDocument('https://example.com/test.json', new AbortController().signal), /FILE_TOO_LARGE/);
  assert.equal(cancelled, true, 'Rejected responses must cancel the stream');
  globalThis.fetch = async () => new Response('{}', { status: 403 });
  await assert.rejects(fetchDocument('https://example.com/test.json', new AbortController().signal), /HTTP 403/);
  const controller = new AbortController(); controller.abort();
  globalThis.fetch = async (_url, init) => { (init?.signal as AbortSignal).throwIfAborted(); return new Response('{}'); };
  await assert.rejects(fetchDocument('https://example.com/test.json', controller.signal), { name: 'AbortError' });
} finally { globalThis.fetch = originalFetch; }
console.log('Local/streamed imports, UTF-8 chunk boundaries, byte limits, response cancellation and abort checks passed.');
