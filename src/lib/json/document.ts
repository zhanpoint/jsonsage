import { visit as visitJson, parseTree, getLocation, createScanner, type JSONVisitor, type ParseOptions, type Node } from 'jsonc-parser';

/** A complete first-line value followed by another record distinguishes a stream
 * from ordinary multiline JSON. Invalid later records remain visible to validation. */
export function isRecordStream(source: string): boolean {
  const end = source.indexOf('\n');
  if (end < 0) return false;
  const scanner = createScanner(source, true);
  scanner.setPosition(end + 1);
  if (scanner.scan() === 17 /* EOF: trailing whitespace/comments belong to one document */) return false;
  let valid = true, value = false;
  visitJson(source.slice(0, end), {
    onObjectBegin: () => { value = true; }, onArrayBegin: () => { value = true; },
    onLiteralValue: () => { value = true; }, onError: () => { valid = false; },
  }, { disallowComments: true });
  return valid && value;
}

/** Replace record separators in place: all real token offsets remain unchanged
 * after subtracting the single virtual opening bracket. Never deserialize numbers. */
export function documentSource(source: string): { text: string; shift: number } {
  if (!isRecordStream(source)) return { text: source, shift: 0 };
  const end = source.endsWith('\n') ? source.length - 1 : source.length;
  return { text: '[' + source.slice(0, end).replace(/\n/g, ',') + source.slice(end) + ']', shift: 1 };
}

export function visitDocument(source: string, visitor: JSONVisitor, options?: ParseOptions) {
  const { text, shift } = documentSource(source);
  if (!shift) return visitJson(source, visitor, options);
  const mapped: JSONVisitor = {};
  for (const name of Object.keys(visitor) as (keyof JSONVisitor)[]) {
    const callback = visitor[name] as (...args: unknown[]) => unknown;
    if (!callback) continue;
    const offsetIndex = ['onObjectProperty', 'onLiteralValue', 'onSeparator', 'onError'].includes(name) ? 1 : 0;
    Object.assign(mapped, { [name]: (...args: unknown[]) => {
      args[offsetIndex] = (args[offsetIndex] as number) - 1;
      return callback(...args);
    } });
  }
  let depth = 0;
  const objectBegin = mapped.onObjectBegin, arrayBegin = mapped.onArrayBegin;
  const objectEnd = mapped.onObjectEnd, arrayEnd = mapped.onArrayEnd, separator = mapped.onSeparator;
  mapped.onObjectBegin = (...args) => { depth++; return objectBegin?.(...args); };
  mapped.onArrayBegin = (...args) => { depth++; return arrayBegin?.(...args); };
  mapped.onObjectEnd = (...args) => { depth--; objectEnd?.(...args); };
  mapped.onArrayEnd = (...args) => { depth--; arrayEnd?.(...args); };
  mapped.onSeparator = (...args) => {
    // A synthesized comma inside a value would silently repair a broken multiline
    // record. Record boundaries are legal only at the virtual array's own depth.
    if (source[args[1] - 1] === '\n' && depth !== 1) visitor.onError?.(4, args[1] - 1, 1, args[3], args[4]);
    separator?.(...args);
  };
  return visitJson(text, mapped, { ...options, allowTrailingComma: false, disallowComments: true });
}

export function parseDocumentTree(source: string, options?: ParseOptions): Node | undefined {
  const { text, shift } = documentSource(source);
  const root = parseTree(text, [], options);
  if (shift && root) {
    const stack = [root];
    while (stack.length) {
      const node = stack.pop()!;
      Object.assign(node, { offset: node.offset - 1 });
      if (node.children) for (const child of node.children) stack.push(child);
    }
  }
  return root;
}

export function documentPath(source: string, offset: number) {
  const { text, shift } = documentSource(source);
  return getLocation(text, offset + shift).path;
}
