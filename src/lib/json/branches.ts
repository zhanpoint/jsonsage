import { visitDocument as visit } from './document';
import { type JsonPath } from './views';
export const BRANCH_PAGE_SIZE = 300;
export function findPathOffset(source: string, path: JsonPath): number {
  let offset = -1;
  const found = {};
  const matches = (other: JsonPath) => other.length === path.length && other.every((part, i) => part === path[i]);
  if (path.length) {
    const locate = (start: number, _length: number, _line: number, _column: number, supplier: () => JsonPath) => {
      if (matches(supplier())) { offset = start; throw found; }
    };
    try { visit(source, { onObjectBegin: locate, onArrayBegin: locate, onLiteralValue: (_value, ...args) => locate(...args) }, { allowTrailingComma: true }); }
    catch (error) { if (error !== found) throw error; }
    if (offset < 0) throw new Error('PATH_NOT_FOUND');
  }
  return path.length ? offset : 0;
}
