import { visit } from 'jsonc-parser';
import { pathText, type JsonPath } from './views';
export const BRANCH_PAGE_SIZE = 300;
type BranchNode = { offset: number; length: number; type: string; path: JsonPath; label: string; preview: string };
export type BranchResult = { rows: BranchNode[]; total: number; parent: BranchNode };
export function findPathOffset(source: string, path: JsonPath): number {
  let offset = 0;
  const found = {};
  const matches = (other: JsonPath) => other.length === path.length && other.every((part, i) => part === path[i]);
  if (path.length) {
    const locate = (start: number, _length: number, _line: number, _column: number, supplier: () => JsonPath) => {
      if (matches(supplier())) { offset = start; throw found; }
    };
    try { visit(source, { onObjectBegin: locate, onArrayBegin: locate, onLiteralValue: (_value, ...args) => locate(...args) }, { allowTrailingComma: true }); }
    catch (error) { if (error !== found) throw error; }
    if (!offset) throw new Error('PATH_NOT_FOUND');
  }
  return offset;
}
/** Visit only token spans. No parsed object graph crosses the Worker boundary. */
export function branch(source: string, path: JsonPath, page = 0): BranchResult {
  const offset = findPathOffset(source, path);
  const rows: BranchNode[] = [];
  let total = 0, depth = 0, current: BranchNode | undefined;
  let parent: BranchNode | undefined;
  const done = {};
  const node = (start: number, length: number, type: string, relative: JsonPath): BranchNode => {
    const full = [...path, ...relative];
    return { offset: offset + start, length, type, path: full, label: full.length ? String(full.at(-1)) : '$', preview: source.slice(offset + start, offset + start + Math.min(length, 150)) + (length > 150 ? '…' : '') };
  };
  const add = (item: BranchNode) => { if (total >= page * BRANCH_PAGE_SIZE && rows.length < BRANCH_PAGE_SIZE) rows.push(item); total++; };
  const begin = (type: string) => (start: number, length: number, _line: number, _column: number, supplier: () => JsonPath) => {
    if (depth === 0) parent = node(start, length, type, []);
    else if (depth === 1) current = node(start, length, type, supplier());
    depth++;
  };
  const end = (start: number, length: number) => {
    depth--;
    if (depth === 1 && current) {
      current.length = offset + start + length - current.offset; current.preview = current.type === 'object' ? '{…}' : '[…]';
      add(current); current = undefined;
    } else if (depth === 0 && parent) { parent.length = offset + start + length - parent.offset; throw done; }
  };
  try {
    visit(source.slice(offset), {
      onObjectBegin: begin('object'), onArrayBegin: begin('array'), onObjectEnd: end, onArrayEnd: end,
      onLiteralValue(value, start, length, _line, _column, supplier) {
        if (depth > 1) return;
        const item = node(start, length, value === null ? 'null' : typeof value, supplier());
        if (depth === 0) { parent = item; throw done; }
        add(item);
      },
    }, { allowTrailingComma: true });
  } catch (error) { if (error !== done) throw error; }
  if (!parent) throw new Error('INVALID_JSON');
  if (parent.type === 'object' || parent.type === 'array') parent.preview = pathText(path);
  return { rows, total, parent };
}
