import { visit } from 'jsonc-parser';
import { validate, type JsonOptions } from './engine';

// Luhn avoids masking arbitrary numbers that merely look like card numbers.
function card(value: string) {
  const digits = value.replace(/[ -]/g, '');
  let sum = 0;
  for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
    let digit = Number(digits[i]);
    if (double && (digit *= 2) > 9) digit -= 9;
    sum += digit;
  }
  return digits.length >= 13 && digits.length <= 19 && sum % 10 === 0;
}
const secretKey = /(?:password|passwd|pwd|secret|token|authorization|api[_-]?key|private[_-]?key)/i;
function maskText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/(?<!\d)(?:\+?86[ -]?)?1[3-9]\d{9}(?!\d)/g, '[phone]')
    .replace(/(?<!\d)[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/g, '[id]')
    .replace(/(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g, match => card(match) ? '[card]' : match)
    .replace(/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g, match => match.split('.').every(part => Number(part) <= 255) ? '[ip]' : match)
    .replace(/(?<![\w:])(?:[\da-f]{0,4}:){2,7}[\da-f]{0,4}(?![\w:])/gi, match => {
      const parts = match.split(':');
      return parts.length === 8 || (match.includes('::') && parts.length <= 8 && match.indexOf('::') === match.lastIndexOf('::')) ? '[ip]' : match;
    });
}
/** Edit only scalar token spans, retaining every untouched byte and numeric literal. */
export function maskJson(source: string, options: JsonOptions = {}) {
  if (!validate(source, options).ok) return { ok: false, source };
  const parts: string[] = [];
  let end = 0, count = 0;
  const replace = (offset: number, length: number, text: string) => { parts.push(source.slice(end, offset), text); end = offset + length; count++; };
  visit(source, { onLiteralValue(value, offset, length, _line, _column, path) {
    const sensitive = path().some(key => typeof key === 'string' && secretKey.test(key));
    const raw = typeof value === 'number' ? source.slice(offset, offset + length) : undefined;
    const numeric = raw === undefined ? undefined : maskText(raw);
    const next = sensitive && value !== null ? '[redacted]' : typeof value === 'string' ? maskText(value) : raw !== undefined && numeric !== raw ? numeric : value;
    if (next === value) return;
    replace(offset, length, JSON.stringify(next));
  }, onComment(offset, length) {
    const raw = source.slice(offset, offset + length), masked = maskText(raw);
    if (masked !== raw) replace(offset, length, masked);
  } }, { allowTrailingComma: options.mode === 'jsonc', disallowComments: options.mode !== 'jsonc' });
  parts.push(source.slice(end));
  return { ok: true, source: parts.join(''), count };
}
