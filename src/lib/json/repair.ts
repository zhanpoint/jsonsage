import { jsonrepair } from 'jsonrepair';
import { validate, type JsonOptions } from './engine';

export type RepairResult =
  | { ok: true; source: string; changed: boolean; commentsMoved?: boolean }
  | { ok: false; source: string; reason: 'empty' | 'failed' };

// Read comments outside quoted strings, including non-standard single-quoted strings.
function collectComments(source: string): string[] {
  const comments: string[] = [];
  for (let i = 0; i < source.length;) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i++] === quote) break;
      }
    } else if (ch === '/' && source[i + 1] === '/') {
      const start = i;
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i++;
      comments.push(source.slice(start, i));
    } else if (ch === '/' && source[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      if (i < source.length) { i += 2; comments.push(source.slice(start, i)); }
      else comments.push(`${source.slice(start)}*/`);
    } else i++;
  }
  return comments;
}

/** Keep numeric literals and duplicate keys intact; valid JSONC remains untouched. */
export function repairJson(source: string, options: JsonOptions = {}): RepairResult {
  if (!source.trim()) return { ok: false, source, reason: 'empty' };
  if (validate(source, options).ok) return { ok: true, source, changed: false };
  try {
    const parts: string[] = [];
    let quoted = '', escaped = false, start = 0;
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quoted) quoted = '';
      } else if (char === '/' && source[i + 1] === '/') {
        while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i++;
      } else if (char === '/' && source[i + 1] === '*') {
        const end = source.indexOf('*/', i + 2); i = end < 0 ? source.length : end + 1;
      } else if (char === '"' || char === "'") quoted = char;
      else if (char === '\uFEFF' || char === '\u200B' || char === '\u2060') {
        parts.push(source.slice(start, i)); start = i + 1;
      }
    }
    parts.push(source.slice(start));
    const repaired = jsonrepair(parts.join(''));
    // jsonrepair emits standard JSON. In JSONC mode preserve comments as a header,
    // since inferred syntax changes make their original offsets unreliable.
    const comments = options.mode === 'jsonc' ? collectComments(source) : [];
    const output = comments.length ? `${comments.join('\n')}\n${repaired}` : repaired;
    if (!validate(output, options).ok) return { ok: false, source, reason: 'failed' };
    return { ok: true, source: output, changed: output !== source, ...(comments.length ? { commentsMoved: true } : {}) };
  } catch {
    return { ok: false, source, reason: 'failed' };
  }
}
