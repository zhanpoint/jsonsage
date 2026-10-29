import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { utils, write } from 'xlsx';
import { workbookPreview } from '../src/lib/officePreview';
import { fetchPreview, previewHref, previewResource, resourceFromMetadata, resolvePreviewResource } from '../src/lib/resourcePreview';

for (const [extension, kind] of Object.entries({ png: 'image', mp3: 'audio', webm: 'video', pdf: 'pdf', md: 'markdown', CSV: 'sheet', xlsx: 'sheet', docx: 'document', doc: 'document', ppt: 'presentation', PPTX: 'presentation' })) {
  assert.equal(previewResource(`https://example.com/文件.${extension}?token=123#page=2`)?.kind, kind);
}
assert.equal(previewResource('https://example.com/page')?.kind, 'unknown');
// An extensionless URL is not evidence of a webpage. Preserve the full signed/query URL for decoding.
const imageUrl = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRS1Hr55nAQuU6HmJ2fhSs70XlqGPHbYbSIUkNI0Sl8Vg&s=10';
assert.deepEqual(previewResource(imageUrl), { url: imageUrl, name: 'images', kind: 'unknown' });
const download = previewResource('https://example.com/download')!;
for (const [contentType, kind] of Object.entries({ 'image/jpeg': 'image', 'audio/mpeg': 'audio', 'video/mp4': 'video', 'application/pdf': 'pdf', 'text/markdown': 'markdown', 'text/html': 'website' })) assert.equal(resourceFromMetadata(download, { contentType }).kind, kind);
assert.equal(resourceFromMetadata(download, { contentType: 'application/octet-stream', name: '报告.xlsx' }).kind, 'sheet');
assert.equal(resourceFromMetadata(download, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }).name, 'download.docx');
for (const value of ['javascript:alert(1)', 'file:///C:/secret.pdf', 'https://user:pass@example.com/a.csv', 'Read https://example.com/a.png', 'https://example.com/a.png\nmore']) assert.equal(previewResource(value), null);
assert.equal(previewHref('../guide.pdf#page=2', 'https://example.com/docs/report.docx'), 'https://example.com/guide.pdf#page=2');
assert.equal(previewHref('mailto:reader@example.com'), 'mailto:reader@example.com');
assert.equal(previewHref('tel:+123456'), 'tel:+123456');
for (const value of ['javascript:alert(1)', 'data:text/html,unsafe', 'file:///D:/secret.pdf', 'https://user:pass@example.com']) assert.equal(previewHref(value), null);

const book = utils.book_new();
const sheet = utils.aoa_to_sheet([['姓名', '数量'], ['甲', 123.45], ['乙', '=HYPERLINK("https://example.com")']]);
sheet.B2.z = '0.00';
sheet.B2.f = '1+2';
sheet['!merges'] = [utils.decode_range('A4:B4')];
utils.book_append_sheet(book, sheet, '明细');
utils.book_append_sheet(book, utils.aoa_to_sheet([[true, '第二页']]), '汇总');
const snapshot = workbookPreview(write(book, { type: 'array', bookType: 'xlsx' }), 'report.xlsx');
assert.equal(snapshot.sheetOrder?.length, 2);
assert.equal(snapshot.sheets?.['sheet-0'].cellData?.[1]?.[1]?.v, '123.45');
assert.equal(snapshot.sheets?.['sheet-0'].cellData?.[1]?.[1]?.f, undefined);
assert.equal(snapshot.sheets?.['sheet-0'].cellData?.[2]?.[1]?.t, 1);
assert.deepEqual(snapshot.sheets?.['sheet-0'].mergeData, [{ startRow: 3, endRow: 3, startColumn: 0, endColumn: 1 }]);
assert.equal(workbookPreview(new TextEncoder().encode('name,value\n"a,b",42').buffer, 'a.csv').sheets?.['sheet-0'].cellData?.[1]?.[0]?.v, 'a,b');
const csv = workbookPreview(new TextEncoder().encode('姓名,编号\n张三,9007199254740993').buffer, 'a.csv');
assert.equal(csv.sheets?.['sheet-0'].cellData?.[1]?.[0]?.v, '张三');
assert.equal(csv.sheets?.['sheet-0'].cellData?.[1]?.[1]?.v, '9007199254740993');
sheet.A1.l = { Target: '../guide.pdf' };
sheet.A2.l = { Target: 'javascript:alert(1)' };
const linked = workbookPreview(write(book, { type: 'array', bookType: 'xlsx' }), 'report.xlsx', 'https://example.com/docs/report.xlsx');
const linkedBody = linked.sheets?.['sheet-0'].cellData?.[0]?.[0]?.p?.body;
assert.match(linkedBody?.dataStream ?? '', /姓名/);
assert.equal(linkedBody?.customRanges?.[0]?.properties?.url, 'https://example.com/guide.pdf');
assert.equal(linked.sheets?.['sheet-0'].cellData?.[1]?.[0]?.p, undefined);
sheet['!ref'] = 'A1:ZZ2';
assert.throws(() => workbookPreview(write(book, { type: 'array', bookType: 'xlsx' }), 'huge.xlsx'), /PREVIEW_TOO_LARGE/);

const originalFetch = globalThis.fetch;
try {
  let metadataRequests = 0;
  globalThis.fetch = async (url, options) => {
    metadataRequests++;
    assert.ok(String(url).includes('metadata=1'));
    assert.equal(options?.credentials, 'omit');
    return Response.json({ contentType: 'application/pdf', name: 'document' });
  };
  assert.equal((await resolvePreviewResource(download, new AbortController().signal)).kind, 'pdf');
  await resolvePreviewResource(download, new AbortController().signal);
  assert.equal(metadataRequests, 1);
} finally { globalThis.fetch = originalFetch; }
// Rejecting response headers must release the unread network body as well.
for (const scenario of ['http-error', 'spa-fallback', 'metadata-fallback'] as const) {
  let cancelled = false;
  globalThis.fetch = async input => {
    if (scenario === 'spa-fallback' && String(input).startsWith('https:')) throw new TypeError('Failed to fetch');
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
      status: scenario === 'http-error' ? 403 : 200, headers: { 'content-type': 'text/html' },
    });
  };
  try {
    const request = scenario === 'metadata-fallback'
      ? resolvePreviewResource(previewResource('https://example.com/uncached-download')!, new AbortController().signal)
      : fetchPreview('https://example.com/a.pdf', new AbortController().signal);
    await assert.rejects(request);
    assert.equal(cancelled, true, `${scenario} must cancel its unread body`);
  } finally { globalThis.fetch = originalFetch; }
}
try {
  globalThis.fetch = async (_input, options) => {
    assert.equal(options?.credentials, 'omit');
    return new Response('hello');
  };
  assert.equal(new TextDecoder().decode(await fetchPreview('https://example.com/a.md', new AbortController().signal)), 'hello');
  const requests: string[] = [];
  globalThis.fetch = async input => {
    requests.push(String(input));
    if (requests.length === 1) throw new TypeError('Failed to fetch');
    return new Response('pdf bytes', { headers: { 'content-type': 'application/octet-stream' } });
  };
  const remote = 'https://example.com/a.pdf?token=signed&key=value';
  assert.equal(new TextDecoder().decode(await fetchPreview(remote, new AbortController().signal)), 'pdf bytes');
  assert.deepEqual(requests, [remote, `/api/preview?url=${encodeURIComponent(remote)}`]);
  globalThis.fetch = async input => {
    if (String(input).startsWith('https:')) throw new TypeError('Failed to fetch');
    return new Response('<html>SPA fallback</html>', { headers: { 'content-type': 'text/html' } });
  };
  await assert.rejects(fetchPreview(remote, new AbortController().signal), /Failed to fetch/);
  globalThis.fetch = async input => {
    if (String(input).startsWith('https:')) throw new TypeError('Failed to fetch');
    return new Response('FILE_FETCH_FAILED', { status: 502 });
  };
  await assert.rejects(fetchPreview(remote, new AbortController().signal), /HTTP 502/);
  globalThis.fetch = async () => new Response('large', { headers: { 'content-length': String(21 * 1024 * 1024) } });
  await assert.rejects(fetchPreview('https://example.com/a.md', new AbortController().signal), /PREVIEW_TOO_LARGE/);
  let cancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(fetchPreview('https://example.com/a.md', new AbortController().signal), /PREVIEW_TOO_LARGE/);
  assert.equal(cancelled, true);
  globalThis.fetch = async () => new Response(null, { status: 403 });
  await assert.rejects(fetchPreview('https://example.com/a.md', new AbortController().signal), /HTTP 403/);
} finally { globalThis.fetch = originalFetch; }
// Use virtual time: a progressing stream may exceed 30s, a stalled one may not.
mock.timers.enable({ apis: ['setTimeout'] });
try {
  let body: ReadableStreamDefaultController<Uint8Array>;
  let requestSignal: AbortSignal;
  globalThis.fetch = async (_input, options) => {
    requestSignal = options!.signal as AbortSignal;
    return new Response(new ReadableStream({ start(controller) {
      body = controller;
      requestSignal.addEventListener('abort', () => controller.error(requestSignal.reason), { once: true });
    } }));
  };
  const slow = fetchPreview('https://example.com/slow.docx', new AbortController().signal);
  await setImmediate();
  for (let i = 0; i < 3; i++) {
    mock.timers.tick(20_000);
    body!.enqueue(new Uint8Array([i]));
    await setImmediate();
    assert.equal(requestSignal!.aborted, false);
  }
  body!.close();
  assert.deepEqual([...new Uint8Array(await slow)], [0, 1, 2]);
  const stalled = fetchPreview('https://example.com/stalled.docx', new AbortController().signal);
  const rejected = assert.rejects(stalled, { name: 'TimeoutError' });
  await setImmediate();
  mock.timers.tick(30_001);
  await rejected;
  const controller = new AbortController();
  const cancelled = fetchPreview('https://example.com/cancelled.docx', controller.signal);
  const aborted = assert.rejects(cancelled, { name: 'AbortError' });
  await setImmediate();
  controller.abort();
  await aborted;
} finally { mock.timers.reset(); globalThis.fetch = originalFetch; }
console.log('Resource preview: URLs, cached workbook values, limits, and fetch failures passed.');
