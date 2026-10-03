import { applyEdits, getNodePath, modify, parseTree, type Node } from 'jsonc-parser';
import { beautifyJson, indentationOptions, type Indent } from './transforms';
import { validate, type JsonOptions } from './engine';

export type JsonPath = (string | number)[];
export type ViewRow = { node: Node; path: JsonPath; depth: number; id: string; label: string };
export const STRUCTURE_LIMIT = 2_000_000;
const VISIBLE_LIMIT = 50_000;
export function pathText(path: JsonPath): string {
  return path.reduce<string>((text, part) => typeof part === 'number' ? `${text}[${part}]`
    : /^[A-Za-z_$][\w$]*$/.test(part) ? `${text}.${part}` : `${text}[${JSON.stringify(part)}]`, '$');
}
export function documentTree(source: string, jsonc: boolean) {
  return parseTree(source, [], { allowTrailingComma: jsonc, disallowComments: !jsonc });
}
/** Access children without allocating a second array for every object. */
export function valueChild(node: Node, index: number): Node {
  const child = node.children![index];
  return node.type === 'object' ? child.children![1] : child;
}
export function childPath(parent: Node, child: Node, index: number, path: JsonPath): JsonPath {
  return [...path, parent.type === 'object' ? String(child.parent?.children?.[0]?.value) : index];
}
export function isContainer(node: Node) { return node.type === 'object' || node.type === 'array'; }
export function rawSummary(source: string, node: Node): string {
  if (isContainer(node)) return `${node.type === 'object' ? '{' : '['}${node.children?.length ?? 0}${node.type === 'object' ? '}' : ']'}`;
  const text = source.slice(node.offset, node.offset + Math.min(node.length, 180));
  return text + (node.length > 180 ? '…' : '');
}
export function pathAtOffset(root: Node, offset: number): JsonPath {
  if (offset < root.offset || offset > root.offset + root.length) return [];
  const path: JsonPath = [];
  let current = root;
  while (current.children?.length) {
    const children = current.children;
    // Children are source-ordered: binary search avoids scanning a large array on each mouse move.
    let low = 0; let high = children.length - 1; let index = -1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (children[middle].offset <= offset) { index = middle; low = middle + 1; } else high = middle - 1;
    }
    if (index < 0) break;
    const child = children[index];
    if (offset > child.offset + child.length) break;
    if (current.type === 'object') path.push(String(child.children![0].value));
    else if (current.type === 'array') path.push(index);
    current = child;
  }
  return path;
}
export function flattenTree(root: Node, expanded: ReadonlySet<number>, limit = VISIBLE_LIMIT): { rows: ViewRow[]; truncated: boolean } {
  const rows: ViewRow[] = [];
  for (const row of walkValues(root, node => expanded.has(node.offset))) {
    if (rows.length === limit) return { rows, truncated: true };
    rows.push(row);
  }
  return { rows, truncated: false };
}
/** Lazy depth-first traversal: pending memory is proportional to depth, not width. */
function* walkValues(root: Node, descend: (node: Node) => boolean = () => true): Generator<ViewRow> {
  const stack = [{ node: root, path: [] as JsonPath, index: -1 }];
  while (stack.length) {
    const frame = stack[stack.length - 1];
    if (frame.index === -1) {
      yield { node: frame.node, path: frame.path, depth: stack.length - 1, id: String(frame.node.offset), label: frame.path.length ? String(frame.path.at(-1)) : '$' };
      frame.index = 0;
      if (!isContainer(frame.node) || !descend(frame.node)) { stack.pop(); continue; }
    }
    if (frame.index >= (frame.node.children?.length ?? 0)) { stack.pop(); continue; }
    const index = frame.index++;
    const node = valueChild(frame.node, index);
    stack.push({ node, path: childPath(frame.node, node, index, frame.path), index: -1 });
  }
}
export function findObjectArrays(root: Node, limit = 100, scanLimit = VISIBLE_LIMIT): ViewRow[] {
  const arrays: ViewRow[] = [];
  let visited = 0;
  for (const row of walkValues(root)) {
    if (arrays.length >= limit || visited++ >= scanLimit) break;
    const children = row.node.children ?? [];
    if (row.node.type === 'array' && children.length && children.every(child => child.type === 'object')) {
      arrays.push(row);
    }
  }
  return arrays;
}
export function tableHeaders(array: Node, limit = 100): { headers: string[]; truncated: boolean } {
  const keys = new Set<string>();
  for (const row of array.children ?? []) {
    for (const property of row.children ?? []) {
      keys.add(String(property.children![0].value));
      if (keys.size > limit) return { headers: [...keys].slice(0, limit), truncated: true };
    }
  }
  return { headers: [...keys], truncated: false };
}

/** Splice raw JSON values rather than round-tripping the document through JS numbers. */
export function editNode(source: string, node: Node, operation: 'replace' | 'add' | 'delete', raw: string, key: string, indent: Indent, options: JsonOptions): string {
  let next: string;
  if (operation === 'replace') {
    if (!validate(raw, options).ok) throw new Error('INVALID_VALUE');
    next = source.slice(0, node.offset) + raw + source.slice(node.offset + node.length);
  } else {
    if (operation === 'delete' && !node.parent) throw new Error('ROOT_DELETE');
    if (operation === 'add' && !isContainer(node)) throw new Error('NOT_CONTAINER');
    const path = getNodePath(node);
    const format = { ...indentationOptions(indent), eol: '\n' };
    if (operation === 'delete') next = applyEdits(source, modify(source, path, undefined, { formattingOptions: format }));
    else {
      if (!validate(raw, options).ok) throw new Error('INVALID_VALUE');
      if (node.type === 'object' && (node.children ?? []).some(p => p.children![0].value === key)) throw new Error('DUPLICATE_KEY');
      const targetPath = [...path, node.type === 'array' ? (node.children?.length ?? 0) : key];
      // Insert a placeholder, then replace its token with raw source, preserving large numbers and comments.
      const inserted = applyEdits(source, modify(source, targetPath, null, { formattingOptions: format }));
      const tree = documentTree(inserted, options.mode === 'jsonc');
      let target = tree;
      for (const part of targetPath) target = typeof part === 'number' ? target?.children?.[part] : target?.children?.find(p => p.children![0].value === part)?.children?.[1];
      if (!target) throw new Error('INVALID_VALUE');
      next = inserted.slice(0, target.offset) + raw + inserted.slice(target.offset + target.length);
    }
  }
  const formatted = beautifyJson(next, indent, options);
  if (!formatted.ok) throw new Error('INVALID_VALUE');
  return formatted.source;
}
