import { validate } from './engine';
import { unescapeJsonText } from './transforms';

export type SmartInput = { kind: 'jwt' | 'base64' | 'escaped'; source: string };
function decode64(text: string) {
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(normalized), char => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
/** Candidates are cheap to detect in the paste handler; decoding stays in a Worker. */
export function smartCandidate(text: string): boolean {
  const start = text.trim();
  return /^https?:\/\/\S+$/i.test(start) || start.startsWith('"') || start.startsWith('{\\"') || start.startsWith('[\\"') || /^[\w+/-]{4,}={0,2}(?:\.[\w-]+\.[\w-]*)?$/.test(start);
}
export function decodeInput(text: string): SmartInput | null {
  const trimmed = text.trim();
  if (validate(trimmed).ok && !trimmed.startsWith('"')) return null;
  const escaped = unescapeJsonText(trimmed);
  // A quoted number/boolean can be intentional JSON data; decode only containers.
  if (escaped.ok && /^[\[{]/.test(escaped.source.trimStart()) && validate(escaped.source).ok) return { kind: 'escaped', source: escaped.source };
  try {
    const segments = trimmed.split('.');
    if (segments.length === 3) {
      const header = decode64(segments[0]), payload = decode64(segments[1]);
      if (validate(header).ok && validate(payload).ok) return { kind: 'jwt', source: payload };
    } else {
      const decoded = decode64(trimmed);
      if (validate(decoded).ok) return { kind: 'base64', source: decoded };
    }
  } catch { /* Ordinary text stays untouched. */ }
  return null;
}
