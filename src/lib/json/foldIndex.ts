import { visit } from 'jsonc-parser';

/** Ordered opening/closing offsets, without allocating a full JSON syntax tree. */
export function indexJsonFolds(source: string): Uint32Array {
  const starts: number[] = [], ends: number[] = [], stack: number[] = [];
  const begin = (offset: number) => { stack.push(starts.length); starts.push(offset + 1); ends.push(0); };
  const end = (offset: number) => { const index = stack.pop(); if (index !== undefined) ends[index] = offset; };
  visit(source, { onObjectBegin: begin, onArrayBegin: begin, onObjectEnd: end, onArrayEnd: end }, { allowTrailingComma: true });
  const ranges = new Uint32Array(starts.length * 2);
  for (let i = 0; i < starts.length; i++) { ranges[i * 2] = starts[i]; ranges[i * 2 + 1] = ends[i]; }
  return ranges;
}
export function foldOnLine(ranges: Uint32Array, start: number, end: number) {
  let low = 0, high = ranges.length / 2;
  while (low < high) { const mid = (low + high) >>> 1; if (ranges[mid * 2] <= start) low = mid + 1; else high = mid; }
  for (let index = low * 2; index < ranges.length && ranges[index] <= end; index += 2) {
    if (ranges[index + 1] > end) return { from: ranges[index], to: ranges[index + 1] };
  }
  return null;
}
