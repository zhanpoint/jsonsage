import { applyEdits, createScanner, format } from 'jsonc-parser';
import { validate, type JsonOptions } from './engine';
import { isRecordStream } from './document';

// jsonc-parser's documented token IDs; its ambient const enum cannot be used
// with this project's isolatedModules compilation setting.
const tokens = { eof: 17, whitespace: 15, lineBreak: 14, lineComment: 12 } as const;

export type Indent = '2' | '4' | 'tab';
export function indentationOptions(indent: Indent) {
  return { insertSpaces: indent !== 'tab', tabSize: indent === '4' ? 4 : 2 };
}
export type TransformResult = { ok: true; source: string } | { ok: false; source: string };

/** Chunk output instead of retaining one array entry per token in MB-sized inputs. */
function textWriter() {
  const chunks: string[] = [];
  let buffer = '';
  return {
    append(text: string) { buffer += text; if (buffer.length >= 65536) { chunks.push(buffer); buffer = ''; } },
    finish() { chunks.push(buffer); return chunks.join(''); },
  };
}
function formatLarge(source: string, indent: Indent): string {
  const scanner = createScanner(source), output = textWriter();
  const unit = indent === 'tab' ? '\t' : ' '.repeat(Number(indent));
  const spaces = [''];
  let depth = 0, previous = 0, breakLine = false, lineStart = true;
  const newline = () => { if (!lineStart) output.append('\n'); lineStart = true; };
  const write = (text: string) => {
    if (lineStart) { spaces[depth] ??= unit.repeat(depth); output.append(spaces[depth]); lineStart = false; }
    output.append(text);
  };
  for (let token = scanner.scan(); token !== tokens.eof; token = scanner.scan()) {
    if (token === tokens.whitespace || token === tokens.lineBreak) continue;
    const raw = source.slice(scanner.getTokenOffset(), scanner.getTokenOffset() + scanner.getTokenLength());
    if (token === 2 || token === 4) {
      depth--;
      if (previous !== (token === 2 ? 1 : 3)) newline();
      write(raw); breakLine = false;
    } else if (token === 5) { write(','); breakLine = true; }
    else if (token === 6) { write(': '); breakLine = false; }
    else {
      if (breakLine) newline();
      if ((token === 12 || token === 13) && !lineStart) output.append(' ');
      write(raw); breakLine = false;
      if (token === 1 || token === 3) { depth++; breakLine = true; }
      else if (token === 12) { newline(); breakLine = true; }
      else if (token === 13) output.append(' ');
    }
    previous = token;
  }
  return output.finish().trimEnd();
}

/** Token-based edits preserve numeric literals, duplicate keys and string whitespace. */
export function beautifyJson(source: string, indent: Indent = '2', options: JsonOptions = {}): TransformResult {
  if (!validate(source, options).ok) return { ok: false, source };
  if (isRecordStream(source)) return { ok: true, source: source.split('\n').map(line => applyEdits(line, format(line, undefined, { ...indentationOptions(indent), keepLines: true }))).join('\n') };
  if (source.length > 2_000_000) return { ok: true, source: formatLarge(source, indent) };
  const output = applyEdits(source, format(source, undefined, {
    ...indentationOptions(indent), eol: '\n',
  }));
  return { ok: true, source: output };
}

export function minifyJson(source: string, options: JsonOptions = {}): TransformResult {
  if (!validate(source, options).ok) return { ok: false, source };
  const records = isRecordStream(source);
  const scanner = createScanner(source);
  const output = textWriter();
  let depth = 0;
  for (let token = scanner.scan(); token !== tokens.eof; token = scanner.scan()) {
    // Record separators are structural, unlike formatting inside each JSON value.
    if (records && token === tokens.lineBreak && depth === 0) output.append(source.slice(scanner.getTokenOffset(), scanner.getTokenOffset() + scanner.getTokenLength()));
    if (token === tokens.whitespace || token === tokens.lineBreak) continue;
    if (token === 1 || token === 3) depth++;
    else if (token === 2 || token === 4) depth--;
    output.append(source.slice(scanner.getTokenOffset(), scanner.getTokenOffset() + scanner.getTokenLength()));
    // A line comment requires a newline; removing it would swallow the next token.
    if (token === tokens.lineComment) output.append('\n');
  }
  return { ok: true, source: output.finish() };
}

/** Produce a full JSON string literal, including outer quotes, for safe embedding. */
export function escapeJsonText(source: string): string {
  return JSON.stringify(source);
}

/** Accept either a JSON string literal or its escaped body; never evaluate code. */
export function unescapeJsonText(source: string): TransformResult {
  const trimmed = source.trim();
  const literal = trimmed.startsWith('"') ? trimmed : `"${source}"`;
  try {
    const value: unknown = JSON.parse(literal);
    return typeof value === 'string' ? { ok: true, source: value } : { ok: false, source };
  } catch {
    return { ok: false, source };
  }
}
