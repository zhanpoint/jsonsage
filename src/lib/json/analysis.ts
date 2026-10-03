import { JSONPath } from 'jsonpath-plus';
import { visit } from 'jsonc-parser';
import { isLosslessNumber } from 'lossless-json';
import { numberKey } from './numbers';
import { parse } from './engine';
import { pathText } from './views';
import type { AdvancedRequest, AdvancedResult } from './advanced';

export const RESULT_LIMIT = 5000;
type QueryRow = { path: string; value: string };
type DiffRow = { path: string; kind: 'CREATE' | 'REMOVE' | 'CHANGE' | 'TYPE'; before: string; after: string };
export type DiffHighlight = { from: number; to: number; kind: DiffRow['kind'] };
export type BasicRequest = { kind: 'query'; source: string; expression: string; jsonc: boolean } | { kind: 'diff'; source: string; other: string; jsonc: boolean };
export type AnalysisRequest = BasicRequest | AdvancedRequest;
export type AnalysisResult = { kind: 'query'; rows: QueryRow[]; truncated: boolean } | { kind: 'diff'; rows: DiffRow[]; total: number; left: DiffHighlight[]; right: DiffHighlight[] } | AdvancedResult;

function highlights(source: string, rows: DiffRow[], side: 'left' | 'right'): DiffHighlight[] {
  const paths = new Map(rows.filter(row => row.kind !== (side === 'left' ? 'CREATE' : 'REMOVE')).map(row => [row.path, row.kind]));
  const marks: DiffHighlight[] = [];
  const mark = (offset: number, length: number, path: (string | number)[]) => {
    const kind = paths.get(pathText(path));
    if (kind) marks.push({ from: offset, to: offset + length, kind });
  };
  const begin = (offset: number, length: number, _line: number, _column: number, path: () => (string | number)[]) => mark(offset, length, path());
  visit(source, {
    onObjectBegin: begin, onArrayBegin: begin,
    onObjectProperty: (key, offset, length, _line, _column, path) => mark(offset, length, [...path(), key]),
    onLiteralValue: (_value, offset, length, _line, _column, path) => mark(offset, length, path()),
  }, { allowTrailingComma: true });
  return marks;
}

function read(source: string, jsonc: boolean): unknown {
  return parse(source, { mode: jsonc ? 'jsonc' : 'strict', lossless: true });
}

/** Bound every preview independently of the size of the matched subtree. */
export function preview(value: unknown, depth = 0): string {
  if (isLosslessNumber(value)) return value.value;
  if (typeof value === 'string') return JSON.stringify(value.length > 300 ? value.slice(0, 300) + '…' : value);
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? '—';
  const array = Array.isArray(value);
  if (depth >= 2) return array ? '[…]' : '{…}';
  const items: string[] = [];
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    if (items.length === 8) { items.push('…'); break; }
    items.push((array ? '' : JSON.stringify(key) + ': ') + preview((value as Record<string, unknown>)[key], depth + 1));
  }
  return (array ? '[' : '{') + items.join(', ') + (array ? ']' : '}');
}

export function analyze(request: BasicRequest): Exclude<AnalysisResult, AdvancedResult> {
  const value = read(request.source, request.jsonc);
  if (request.kind === 'query') {
    if (!request.expression.trim().startsWith('$')) throw new Error('INVALID_PATH');
    const rows: QueryRow[] = [];
    const limit = new Error('RESULT_LIMIT');
    let truncated = false;
    try {
      // JSONPath Plus rejects falsy root inputs. A single-element root adapter
      // supports every JSON root without copying data or exposing the adapter.
      const rootPath = '$[0]';
      JSONPath({ path: rootPath + request.expression.trim().slice(1), json: [value], resultType: 'all', eval: false, callback: (result: { path: string; value: unknown }) => {
        if (!result.path.startsWith(rootPath)) return;
        if (rows.length === RESULT_LIMIT) throw limit;
        rows.push({ path: '$' + result.path.slice(rootPath.length), value: preview(result.value) });
      } });
    } catch (error) {
      if (error === limit) truncated = true;
      else throw error;
    }
    return { kind: 'query', rows, truncated };
  }
  const other = read(request.other, request.jsonc);
  const rows: DiffRow[] = [];
  let total = 0;
  const type = (item: unknown) => isLosslessNumber(item) ? 'number' : item === null ? 'null' : Array.isArray(item) ? 'array' : typeof item;
  const emit = (path: (string | number)[], kind: DiffRow['kind'], before: unknown, after: unknown) => {
    total++;
    if (rows.length < RESULT_LIMIT) rows.push({ path: pathText(path), kind, before: kind === 'CREATE' ? '—' : preview(before), after: kind === 'REMOVE' ? '—' : preview(after) });
  };
  // Walk one level at a time: no key sorting, cloned objects or unbounded diff list.
  const walk = (a: unknown, b: unknown, path: (string | number)[]) => {
    const kind = type(a);
    if (kind !== type(b)) { emit(path, 'TYPE', a, b); return; }
    if (kind === 'number') {
      if (numberKey(String(a)) !== numberKey(String(b))) emit(path, 'CHANGE', a, b);
    } else if (kind === 'object' || kind === 'array') {
      const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
      const childPath = (key: string) => [...path, kind === 'array' ? Number(key) : key];
      for (const key of Object.keys(left)) {
        if (!Object.hasOwn(right, key)) emit(childPath(key), 'REMOVE', left[key], undefined);
        else walk(left[key], right[key], childPath(key));
      }
      for (const key of Object.keys(right)) if (!Object.hasOwn(left, key)) emit(childPath(key), 'CREATE', undefined, right[key]);
    } else if (a !== b) emit(path, 'CHANGE', a, b);
  };
  walk(value, other, []);
  return { kind: 'diff', total, rows, left: highlights(request.source, rows, 'left'), right: highlights(request.other, rows, 'right') };
}
