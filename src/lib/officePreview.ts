import { read, utils, type WorkBook } from 'xlsx';
import type { IWorkbookData } from '@univerjs/presets';

/** Display cached values; never execute formulas or external workbook links. */
export function workbookPreview(bytes: ArrayBuffer, name: string): Partial<IWorkbookData> {
  const isText = /\.(csv|tsv)$/i.test(name);
  const book: WorkBook = read(isText ? new TextDecoder().decode(bytes) : bytes, {
    type: isText ? 'string' : 'array', raw: isText, cellFormula: false, cellHTML: false, sheetRows: 10_001,
  });
  if (book.SheetNames.length > 50) throw new Error('PREVIEW_TOO_LARGE');
  const sheets: IWorkbookData['sheets'] = {};
  let count = 0;
  const sheetOrder = book.SheetNames.map((title, index) => {
    const source = book.Sheets[title];
    const range = utils.decode_range(source['!fullref'] || source['!ref'] || 'A1');
    if (range.e.r >= 10_000 || range.e.c >= 256) throw new Error('PREVIEW_TOO_LARGE');
    const cellData: NonNullable<IWorkbookData['sheets'][string]['cellData']> = {};
    for (const address of Object.keys(source)) {
      if (address.startsWith('!')) continue;
      if (++count > 100_000) throw new Error('PREVIEW_TOO_LARGE');
      const { r, c } = utils.decode_cell(address);
      const cell = source[address];
      if (cell.v == null) continue;
      (cellData[r] ??= {})[c] = { v: cell.w ?? utils.format_cell(cell), t: 1 };
    }
    const id = `sheet-${index}`;
    sheets[id] = { id, name: title, rowCount: Math.max(range.e.r + 1, 30), columnCount: Math.max(range.e.c + 1, 10), cellData,
      mergeData: (source['!merges'] ?? []).map(({ s, e }) => ({ startRow: s.r, endRow: e.r, startColumn: s.c, endColumn: e.c })) };
    return id;
  });
  return { name, sheetOrder, sheets };
}
