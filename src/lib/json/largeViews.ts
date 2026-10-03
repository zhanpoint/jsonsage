import { visit } from 'jsonc-parser';
import { findPathOffset, BRANCH_PAGE_SIZE } from './branches';
import { type JsonPath } from './views';
export type GraphItem = { id: string; parent?: string; depth: number; path: JsonPath; type: string; preview: string };
export type GraphResult = { kind: 'graph'; items: GraphItem[]; truncated: boolean };
export type ArrayEntry = { path: JsonPath; count: number };
export type TableResult = { kind: 'table'; headers: string[]; rows: { index: number; cells: Record<string, string> }[]; total: number; truncated: boolean };
export type LargeRequest = { kind: 'discover' } | { kind: 'table'; path: JsonPath; page: number } | { kind: 'graph'; depth: number };
export type LargeResult = GraphResult | TableResult | { kind: 'discover'; arrays: ArrayEntry[] };
const limit = {};
const snippet = (source: string, offset: number, length: number) => source.slice(offset, offset + Math.min(length, 150)) + (length > 150 ? '…' : '');
export function largeGraph(source: string, maxDepth: number): GraphResult {
  const items: GraphItem[] = [];
  const stack: string[] = [];
  let truncated = false;
  const add = (offset: number, type: string, preview: string, path: JsonPath) => {
    if (stack.length > maxDepth) { truncated = true; return; }
    if (items.length === 300) { truncated = true; throw limit; }
    items.push({ id: String(offset), parent: stack.at(-1), depth: stack.length, path, type, preview });
  };
  const begin = (type: string) => (offset: number, _length: number, _line: number, _column: number, path: () => JsonPath) => { add(offset, type, type === 'object' ? '{…}' : '[…]', path()); stack.push(String(offset)); };
  try {
    visit(source, { onObjectBegin: begin('object'), onArrayBegin: begin('array'), onObjectEnd: () => { stack.pop(); }, onArrayEnd: () => { stack.pop(); }, onLiteralValue: (value, offset, length, _line, _column, path) => add(offset, value === null ? 'null' : typeof value, snippet(source, offset, length), path()) }, { allowTrailingComma: true });
  } catch (error) { if (error !== limit) throw error; }
  return { kind: 'graph', items, truncated };
}
export function discoverArrays(source: string): ArrayEntry[] {
  const stack: { array: boolean; objects: number; valid: boolean; path: JsonPath }[] = [];
  const arrays: ArrayEntry[] = [];
  const begin = (array: boolean) => (_offset: number, _length: number, _line: number, _column: number, path: () => JsonPath) => {
    const parent = stack.at(-1);
    if (parent?.array) { if (array) parent.valid = false; else parent.objects++; }
    stack.push({ array, valid: true, objects: 0, path: array ? path() : [] });
  };
  const end = () => {
    const current = stack.pop()!;
    if (current.array && current.valid && current.objects) {
      arrays.push({ path: current.path, count: current.objects });
      if (arrays.length === 100) throw limit;
    }
  };
  try { visit(source, { onArrayBegin: begin(true), onObjectBegin: begin(false), onArrayEnd: end, onObjectEnd: end, onLiteralValue: () => { const parent = stack.at(-1); if (parent?.array) parent.valid = false; } }, { allowTrailingComma: true }); }
  catch (error) { if (error !== limit) throw error; }
  return arrays;
}
export function largeTable(source: string, path: JsonPath, page: number): TableResult {
  const parentOffset = findPathOffset(source, path);
  const headers = new Set<string>(), rows: TableResult['rows'] = [];
  let depth = 0, index = -1, total = 0, truncated = false;
  let current: TableResult['rows'][number] | undefined;
  const cell = (relative: JsonPath, value: string) => { if (current && relative.length === 2 && headers.has(String(relative[1]))) current.cells[String(relative[1])] = value; };
  const begin = (object: boolean) => (_offset: number, _length: number, _line: number, _column: number, supplier: () => JsonPath) => {
    if (depth === 0 && object) throw new Error('NOT_OBJECT_ARRAY');
    if (depth === 1) {
      if (!object) throw new Error('NOT_OBJECT_ARRAY');
      index++; total++;
      current = index >= page * BRANCH_PAGE_SIZE && index < (page + 1) * BRANCH_PAGE_SIZE ? { index, cells: Object.create(null) } : undefined;
      if (current) rows.push(current);
    } else if (depth === 2) cell(supplier(), object ? '{…}' : '[…]');
    depth++;
  };
  const end = () => { depth--; if (depth === 1) current = undefined; if (depth === 0) throw limit; };
  try {
    visit(source.slice(parentOffset), {
      onArrayBegin: begin(false), onObjectBegin: begin(true), onArrayEnd: end, onObjectEnd: end,
      onObjectProperty(key) { if (depth === 2) { if (headers.size < 100 || headers.has(key)) headers.add(key); else truncated = true; } },
      onLiteralValue(_value, offset, length, _line, _column, supplier) { if (depth <= 1) throw new Error('NOT_OBJECT_ARRAY'); if (depth === 2) cell(supplier(), snippet(source, parentOffset + offset, length)); },
    }, { allowTrailingComma: true });
  } catch (error) { if (error !== limit) throw error; }
  return { kind: 'table', headers: [...headers], rows, total, truncated };
}
export function largeView(source: string, request: LargeRequest): LargeResult {
  return request.kind === 'graph' ? largeGraph(source, request.depth) : request.kind === 'discover' ? { kind: 'discover', arrays: discoverArrays(source) } : largeTable(source, request.path, request.page);
}
