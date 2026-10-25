import assert from 'node:assert/strict';
import { utils, write } from 'xlsx';
import { workbookPreview } from '../src/lib/officePreview';
import { fetchPreview, previewResource } from '../src/lib/resourcePreview';

for (const [extension, kind] of Object.entries({ png: 'image', mp3: 'audio', webm: 'video', pdf: 'pdf', md: 'markdown', CSV: 'sheet', xlsx: 'sheet', docx: 'document', doc: 'document' })) {
  assert.equal(previewResource(`https://example.com/文件.${extension}?token=123#page=2`)?.kind, kind);
}
assert.equal(previewResource('https://example.com/page')?.kind, 'website');
for (const value of ['javascript:alert(1)', 'file:///C:/secret.pdf', 'https://user:pass@example.com/a.csv', 'Read https://example.com/a.png', 'https://example.com/a.png\nmore']) assert.equal(previewResource(value), null);

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
sheet['!ref'] = 'A1:ZZ2';
assert.throws(() => workbookPreview(write(book, { type: 'array', bookType: 'xlsx' }), 'huge.xlsx'), /PREVIEW_TOO_LARGE/);

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (_input, options) => {
    assert.equal(options?.credentials, 'omit');
    return new Response('hello');
  };
  assert.equal(new TextDecoder().decode(await fetchPreview('https://example.com/a.md', new AbortController().signal)), 'hello');
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
console.log('Resource preview: URLs, cached workbook values, limits, and fetch failures passed.');
