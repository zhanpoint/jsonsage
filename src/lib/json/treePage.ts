import { visitDocument as visit } from './document';
import type { JsonPath } from './views';

export const TREE_PAGE_SIZE = 300;
export type TreeExpansion = { all: boolean; root: boolean; offsets: number[] };
type PagedTreeNode = { offset: number; length: number; type: string; path: JsonPath; label: string; preview: string; depth: number; expanded: boolean; last: boolean };
export type TreePage = { rows: PagedTreeNode[]; total: number };

/** Stream token spans and retain only one visible page, without building an object graph. */
export function treePage(source: string, expansion: TreeExpansion, page = 0): TreePage {
  const exceptions = new Set(expansion.offsets), rows: PagedTreeNode[] = [];
  const stack: { visible: boolean; expanded: boolean; row?: PagedTreeNode; count: number; lastRow?: PagedTreeNode }[] = [];
  let total = 0;
  const add = (type: string, offset: number, length: number, path: () => JsonPath) => {
    const parent = stack.at(-1);
    if (parent) parent.count++;
    const visible = !parent || parent.visible && parent.expanded;
    const expanded = (expansion.all || !parent && expansion.root) !== exceptions.has(offset);
    let row: PagedTreeNode | undefined;
    if (visible) {
      if (parent?.lastRow) parent.lastRow.last = false;
      if (total >= page * TREE_PAGE_SIZE && rows.length < TREE_PAGE_SIZE) {
        const location = path();
        row = { offset, length, type, path: location, label: location.length ? String(location.at(-1)) : '$', depth: stack.length, expanded, last: true,
          preview: type === 'object' ? '{…}' : type === 'array' ? '[…]' : source.slice(offset, offset + Math.min(length, 150)) + (length > 150 ? '…' : '') };
        rows.push(row);
      }
      if (parent) parent.lastRow = row;
      total++;
    }
    return { visible, expanded, row, count: 0 };
  };
  const begin = (type: string) => (offset: number, length: number, _line: number, _column: number, path: () => JsonPath) => { stack.push(add(type, offset, length, path)); };
  const end = (offset: number, length: number) => {
    const frame = stack.pop()!;
    if (frame.row) {
      frame.row.length = offset + length - frame.row.offset;
      frame.row.preview = frame.row.type === 'array' ? `[${frame.count}]` : `{${frame.count}}`;
    }
  };
  visit(source, {
    onObjectBegin: begin('object'), onArrayBegin: begin('array'), onObjectEnd: end, onArrayEnd: end,
    onLiteralValue: (value, offset, length, _line, _column, path) => { add(value === null ? 'null' : typeof value, offset, length, path); },
  }, { allowTrailingComma: true });
  return { rows, total };
}
