import { visitDocument as visit } from './document';

/** Ordered opening/closing offsets, without allocating a full JSON syntax tree. */
export function createFoldIndex() {
  let ranges = new Uint32Array(1024), length = 0;
  const stack: number[] = [];
  const begin = (offset: number) => {
    if (offset < 0) return;
    if (length === ranges.length) { const next = new Uint32Array(length * 2); next.set(ranges); ranges = next; }
    stack.push(length); ranges[length] = offset + 1; length += 2;
  };
  const end = (offset: number) => { const index = stack.pop(); if (index !== undefined) ranges[index + 1] = offset; };
  return { begin, end, finish: () => ranges.slice(0, length) };
}
export function indexJsonFolds(source: string): Uint32Array {
  const index = createFoldIndex();
  visit(source, { onObjectBegin: index.begin, onArrayBegin: index.begin, onObjectEnd: index.end, onArrayEnd: index.end }, { allowTrailingComma: true });
  return index.finish();
}
export function foldOnLine(ranges: Uint32Array, start: number, end: number) {
  const after = (offset: number, low = 0) => {
    let high = ranges.length / 2;
    while (low < high) { const mid = (low + high) >>> 1; if (ranges[mid * 2] <= offset) low = mid + 1; else high = mid; }
    return low * 2;
  };
  for (let index = after(start); index < ranges.length && ranges[index] <= end;) {
    if (ranges[index + 1] > end) return { from: ranges[index], to: ranges[index + 1] };
    // A container entirely on this line cannot contain a multiline child.
    // Skip its subtree, especially for minified documents with millions of nodes.
    index = ranges[index + 1] >= ranges[index] ? after(ranges[index + 1], index / 2 + 1) : index + 2;
  }
  return null;
}
