import { visit, createScanner, printParseErrorCode, type ParseError } from 'jsonc-parser';
import { LosslessNumber, isLosslessNumber, isSafeNumber } from 'lossless-json';

type JsonMode = 'strict' | 'jsonc';
type DiagnosticSeverity = 'error' | 'warning';
type DuplicateKeyPolicy = 'warn' | 'error' | 'allow';

export interface JsonDiagnostic {
  code: string;
  message: string;
  severity: DiagnosticSeverity;
  start: number;
  end: number;
  hint?: string;
  related?: { start: number; end: number };
  location?: { line: number; column: number };
}

export interface JsonOptions {
  mode?: JsonMode;
  duplicateKeys?: DuplicateKeyPolicy;
  reviver?: (this: unknown, key: string, value: unknown) => unknown;
  lossless?: boolean;
}

export type JsonInput = string | Uint8Array | ArrayBuffer;
export interface ValidationResult { ok: boolean; diagnostics: JsonDiagnostic[] }
export interface ParseResult extends ValidationResult { value: unknown }

const MAX_DIAGNOSTICS = 100;
const diagnostic = (
  code: string,
  message: string,
  start: number,
  end: number,
  hint?: string,
  severity: DiagnosticSeverity = 'error',
): JsonDiagnostic => ({ code, message, severity, start, end, ...(hint ? { hint } : {}) });

function decode(input: JsonInput): { source: string; diagnostics: JsonDiagnostic[] } {
  if (typeof input === 'string') return { source: input, diagnostics: [] };
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  try {
    return { source: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), diagnostics: [] };
  } catch {
    return {
      source: new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes),
      diagnostics: [diagnostic('E027', 'input contains invalid UTF-8 bytes', 0, 1, 'Re-encode the input as UTF-8.')],
    };
  }
}

function lineColumn(source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, Math.max(0, offset));
  const lines = before.split(/\r\n|\r|\n/);
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function scan(source: string, options: JsonOptions): { normalized: string; diagnostics: JsonDiagnostic[] } {
  const diagnostics: JsonDiagnostic[] = [];
  const mode = options.mode ?? 'strict';
  const edits: { start: number; end: number; text: string }[] = [];
  const blank = (start: number, end: number) => {
    edits.push({ start, end, text: source.slice(start, end).replace(/[^\r\n]/g, ' ') });
  };

  for (let i = 0; i < source.length && diagnostics.length < MAX_DIAGNOSTICS;) {
    const ch = source[i];
    if (ch === '"') {
      const start = i++;
      let closed = false;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === '"') { i++; closed = true; break; }
        if (source.charCodeAt(i) < 0x20 && diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push(diagnostic('E016', 'unescaped control character in string', i, i + 1));
        i++;
      }
      if (!closed) diagnostics.push(diagnostic('E013', 'unterminated string', start, source.length));
      continue;
    }
    if (ch === "'") {
      diagnostics.push(diagnostic('E010', 'strings must use double quotes', i, i + 1, 'JSON strings use double quotes.'));
      i++;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i++] === "'") break;
      }
      continue;
    }
    if (ch === '/' && (source[i + 1] === '/' || source[i + 1] === '*')) {
      const start = i;
      const lineComment = source[i + 1] === '/';
      i += 2;
      if (lineComment) while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i++;
      else {
        while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
        if (i < source.length) i += 2;
        else diagnostics.push(diagnostic('E020', 'unterminated block comment', start, source.length));
      }
      if (mode === 'strict') diagnostics.push(diagnostic('E021', 'comments are not allowed in strict JSON', start, i, 'Enable JSONC mode to allow comments.'));
      blank(start, i);
      continue;
    }
    i++;
  }

  // Streaming scanner avoids an array entry for every character in large files.
  const scanner = createScanner(source, true);
  let comma = -1;
  for (let token = scanner.scan(); token !== 17; token = scanner.scan()) {
    if (token === 12 || token === 13) continue;
    const at = scanner.getTokenOffset();
    if ((token === 2 || token === 4) && comma >= 0) {
      if (mode === 'strict') diagnostics.push(diagnostic('E008', 'trailing comma is not allowed in strict JSON', comma, comma + 1, 'Enable JSONC mode to allow trailing commas.'));
      else edits.push({ start: comma, end: comma + 1, text: ' ' });
    }
    comma = token === 5 ? at : -1;
    if (token === 16) {
      const value = scanner.getTokenValue();
      if (['True', 'False', 'None', 'undefined'].includes(value)) diagnostics.push(diagnostic('E030', `'${value}' is not valid JSON`, at, at + scanner.getTokenLength(), `Use ${value === 'None' ? 'null' : value.toLowerCase()}.`));
    }
    if (diagnostics.length >= MAX_DIAGNOSTICS) break;
  }
  if (!edits.length) return { normalized: source, diagnostics: diagnostics.slice(0, MAX_DIAGNOSTICS) };
  edits.sort((a, b) => a.start - b.start);
  const parts: string[] = [];
  let offset = 0;
  for (const edit of edits) { parts.push(source.slice(offset, edit.start), edit.text); offset = edit.end; }
  parts.push(source.slice(offset));
  return { normalized: parts.join(''), diagnostics: diagnostics.slice(0, MAX_DIAGNOSTICS) };
}

function run(input: JsonInput, options: JsonOptions, deserialize = true): ParseResult {
  const { source, diagnostics: decodeDiagnostics } = decode(input);
  const { normalized, diagnostics } = scan(source, options);
  const all = [...decodeDiagnostics, ...diagnostics];
  let value: unknown;

  const syntaxErrors: ParseError[] = [];
  const objectKeys: Array<Map<string, { start: number; end: number }>> = [];
  visit(normalized, {
    onObjectBegin: () => { objectKeys.push(new Map()); },
    onObjectEnd: () => { objectKeys.pop(); },
    onObjectProperty: (key, start, length) => {
      if (options.duplicateKeys === 'allow') return;
      const scope = objectKeys.at(-1);
      const previous = scope?.get(key);
      const end = start + length;
      if (previous && all.length < MAX_DIAGNOSTICS) {
        all.push({ ...diagnostic('W060', `duplicate object key ${JSON.stringify(key)}`, start, end,
          'The last value for this key takes precedence.', options.duplicateKeys === 'error' ? 'error' : 'warning'), related: previous });
      } else scope?.set(key, { start, end });
    },
    onError: (error, offset, length) => {
      if (syntaxErrors.length < MAX_DIAGNOSTICS) syntaxErrors.push({ error, offset, length });
    },
  }, { disallowComments: true, allowTrailingComma: options.mode === 'jsonc' });
  const syntaxMessages: Record<string, [string, string]> = {
    ['InvalidSymbol']: ['Invalid token or unquoted object key', 'Use double quotes for keys and strings.'],
    ['InvalidNumberFormat']: ['Invalid number', 'Use a JSON number without leading zeros or incomplete exponents.'],
    ['PropertyNameExpected']: ['Expected a double-quoted object key', 'Add a quoted key or remove the extra comma.'],
    ['ValueExpected']: ['Expected a JSON value', 'Provide a string, number, object, array, boolean or null.'],
    ['ColonExpected']: ['Missing colon after object key', 'Insert : between the key and value.'],
    ['CommaExpected']: ['Missing comma between items', 'Separate object properties or array items with a comma.'],
    ['CloseBraceExpected']: ['Missing closing brace }', 'Close the object with }.'],
    ['CloseBracketExpected']: ['Missing closing bracket ]', 'Close the array with ].'],
    ['EndOfFileExpected']: ['Unexpected content after JSON value', 'Remove extra brackets or content after the root value.'],
    ['UnexpectedEndOfString']: ['Unterminated string', 'Close the string with a double quote.'],
    ['InvalidEscapeCharacter']: ['Invalid string escape', 'Use a valid JSON escape or escape the backslash.'],
    ['InvalidUnicode']: ['Invalid Unicode escape', 'Use four hexadecimal digits after \\u.'],
    ['InvalidCharacter']: ['Unescaped control character', 'Escape newlines, tabs and other control characters.'],
  };
  for (const error of syntaxErrors) {
    if (all.some((item) => item.severity === 'error' && error.offset >= item.start && error.offset < Math.max(item.end, item.start + 1))) continue;
    const [message, hint] = syntaxMessages[printParseErrorCode(error.error)] ?? ['Invalid JSON syntax', 'Check the syntax at this location.'];
    all.push(diagnostic(`S${error.error}`, message, error.offset, Math.min(source.length, error.offset + Math.max(1, error.length)), hint));
    if (all.length >= MAX_DIAGNOSTICS) break;
  }
  if (deserialize && !all.some((item) => item.severity === 'error')) {
    try {
      value = readTokens(normalized, options);
    } catch {
      all.push(diagnostic('E001', 'Invalid JSON syntax', 0, Math.min(source.length, 1), 'Check the syntax at this location.'));
    }
  }

  const hasErrors = all.some((item) => item.severity === 'error');
  // Prioritize errors before applying the cap so numerous warnings cannot hide invalidity.
  const resultDiagnostics = [...all.filter((item) => item.severity === 'error'), ...all.filter((item) => item.severity === 'warning')]
    .slice(0, MAX_DIAGNOSTICS).sort((left, right) => left.start - right.start);
  return { ok: !hasErrors, value, diagnostics: resultDiagnostics };
}

/** jsonc-parser owns syntax; lossless-json owns numbers. Define every key as data,
 * including __proto__, rather than invoking Object.prototype setters. */
function readTokens(source: string, options: JsonOptions): unknown {
  const stack: { value: Record<string, unknown> | unknown[]; key: string }[] = [];
  let result: unknown;
  const assign = (value: unknown) => {
    const parent = stack.at(-1);
    if (!parent) result = value;
    else if (Array.isArray(parent.value)) parent.value.push(value);
    else Object.defineProperty(parent.value, parent.key, { value, enumerable: true, writable: true, configurable: true });
  };
  const begin = (value: Record<string, unknown> | unknown[]) => { assign(value); stack.push({ value, key: '' }); };
  visit(source, {
    onObjectBegin: () => begin({}), onArrayBegin: () => begin([]),
    onObjectEnd: () => { stack.pop(); }, onArrayEnd: () => { stack.pop(); },
    onObjectProperty: key => { stack.at(-1)!.key = key; },
    onLiteralValue(value, offset, length) {
      if (typeof value !== 'number') { assign(value); return; }
      const text = source.slice(offset, offset + length);
      if (!options.lossless && isSafeNumber(text)) { assign(Number(text)); return; }
      const number = new LosslessNumber(text);
      Object.defineProperties(number, { value: { enumerable: false }, isLosslessNumber: { enumerable: false } });
      assign(number);
    },
  });
  if (!options.reviver) return result;
  const revive = (parent: Record<string, unknown> | unknown[], key: string): unknown => {
    const value = (parent as Record<string, unknown>)[key];
    if (value && typeof value === 'object' && !isLosslessNumber(value)) {
      for (const child of Object.keys(value)) {
        const next = revive(value as Record<string, unknown>, child);
        if (next === undefined) delete (value as Record<string, unknown>)[child];
        else Object.defineProperty(value, child, { value: next, writable: true, configurable: true, enumerable: true });
      }
    }
    return options.reviver!.call(parent, key, value);
  };
  return revive({ '': result }, '');
}

export function validate(input: JsonInput, options: JsonOptions = {}): ValidationResult {
  const { ok, diagnostics } = run(input, options, false);
  return { ok, diagnostics };
}

/** Resolve sorted diagnostic positions with one scan, away from the rendering thread. */
export function diagnosticLocations(source: string, diagnostics: JsonDiagnostic[]): JsonDiagnostic[] {
  let offset = 0, line = 1, column = 1;
  return [...diagnostics].sort((a, b) => a.start - b.start).map(item => {
    const target = Math.min(source.length, Math.max(0, item.start));
    for (; offset < target; offset++) {
      if (source[offset] === '\r') { line++; column = 1; }
      else if (source[offset] === '\n') { if (source[offset - 1] !== '\r') line++; column = 1; }
      else column++;
    }
    return { ...item, location: { line, column } };
  });
}

export function tryParse(input: JsonInput, options: JsonOptions = {}): ParseResult {
  return run(input, options);
}

export function parse(input: JsonInput, options: JsonOptions = {}): unknown {
  const result = run(input, options);
  const error = result.diagnostics.find((item) => item.severity === 'error');
  if (error) {
    const position = lineColumn(decode(input).source, error.start);
    const exception = new SyntaxError(`${error.message} (line ${position.line}, column ${position.column})`);
    Object.assign(exception, { code: error.code, diagnostics: result.diagnostics });
    throw exception;
  }
  return result.value;
}

export { lineColumn };
