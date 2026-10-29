import { createScanner } from 'jsonc-parser';
import { documentSource } from './json/document';
import type { JsonPath } from './json/views';

export type ValueLocation = { path: JsonPath; offset: number; length: number; requestedPath?: JsonPath };
type Entry = ValueLocation & { type: string; value: string };
export type InspectorQuery = { kind: 'preview'; path: JsonPath }
  | { kind: 'locate'; path: JsonPath; direction?: -1 | 1 };
export type InspectorResults = { preview: { text: string | null; length?: number }; locate: ValueLocation | null };
export type InspectorRequest = { kind: 'sync'; revision: number; source: string }
  | { kind: 'change'; revision: number; from: number; to: number; insert: string }
  | { kind: 'cancel'; channel: string }
  | { kind: 'query'; revision: number; id: number; channel: string; query: InspectorQuery };
export type InspectorResponse = { revision: number; id: number; result?: InspectorResults[keyof InspectorResults]; error?: string };

const samePath = (a: JsonPath, b: JsonPath) => a.length === b.length && a.every((part, i) => part === b[i]);
const previewText = (entry: Entry) => entry.type !== 'string' ? { text: null } : entry.value.length > 50_000 ? { text: entry.value.slice(0, 50_000), length: entry.value.length } : { text: entry.value };

/** Streaming token walk: retain only the current ancestry, never a second object graph.
 * Yield at every token so a huge object can be cancelled even before its next value. */
function* entries({ text, shift }: { text: string; shift: number }): Generator<Entry | null> {
  const scanner = createScanner(text, true);
  const stack: { path: JsonPath; array: boolean; index: number; key: string; keyExpected: boolean }[] = [];
  for (let token = scanner.scan(); token !== 17; token = scanner.scan()) {
    if (scanner.getTokenError() !== 0) { yield null; continue; }
    const offset = scanner.getTokenOffset() - shift;
    if (token === 2 || token === 4) { stack.pop(); yield null; continue; }
    const parent = stack.at(-1);
    if (token === 5 || token === 6) { if (token === 5 && parent && !parent.array) parent.keyExpected = true; yield null; continue; }
    if (token === 10 && parent && !parent.array && parent.keyExpected) {
      parent.key = scanner.getTokenValue(); parent.keyExpected = false; yield null; continue;
    }
    const container = token === 1 || token === 3;
    if (!container && ![7, 8, 9, 10, 11].includes(token)) { yield null; continue; }
    const path = parent ? [...parent.path, parent.array ? parent.index++ : parent.key] : [];
    const length = scanner.getTokenLength();
    const type = token === 1 ? 'object' : token === 3 ? 'array' : token === 10 ? 'string' : token === 11 ? 'number' : token === 7 ? 'null' : 'boolean';
    const value = container ? (token === 1 ? '{…}' : '[…]') : token === 10 ? scanner.getTokenValue() : text.slice(scanner.getTokenOffset(), scanner.getTokenOffset() + length);
    if (container) stack.push({ path, array: token === 3, index: 0, key: '', keyExpected: true });
    // Synthetic JSONL array has no source range but its children use ordinary array paths.
    yield offset < 0 ? null : { path, offset, length, type, value };
  }
}

export class DocumentInspector {
  private source = '';
  private revision = 0;
  private cancelled = new Map<string, number>();
  private locations = new Map<string, Entry>();
  private prepared: ReturnType<typeof documentSource> | null = null;
  sync(source: string, revision: number) { this.source = source; this.revision = revision; this.locations.clear(); this.prepared = null; }
  change(from: number, to: number, insert: string, revision: number) {
    this.source = this.source.slice(0, from) + insert + this.source.slice(to);
    this.revision = revision;
    this.locations.clear();
    this.prepared = null;
  }
  cancel(channel: string) { this.cancelled.set(channel, (this.cancelled.get(channel) ?? 0) + 1); }
  query<K extends InspectorQuery['kind']>(query: Extract<InspectorQuery, { kind: K }>, channel?: string): Promise<InspectorResults[K]>;
  async query(query: InspectorQuery, channel = query.kind as string): Promise<InspectorResults[keyof InspectorResults]> {
    this.cancel(channel);
    const token = this.cancelled.get(channel), revision = this.revision;
    const check = () => {
      if (revision !== this.revision || token !== this.cancelled.get(channel)) throw new DOMException('Superseded', 'AbortError');
    };
    // Give newer messages a chance to cancel queued work before any scanning starts.
    await new Promise(resolve => setTimeout(resolve, 0));
    check();
    const path = [...query.path];
    let arrayIndex = -1;
    for (let i = path.length - 1; i >= 0; i--) if (typeof path[i] === 'number') { arrayIndex = i; break; }
    if (query.kind === 'locate' && query.direction && arrayIndex >= 0) path[arrayIndex] = Number(path[arrayIndex]) + query.direction;
    if (query.kind === 'locate' && query.direction && (arrayIndex < 0 || Number(path[arrayIndex]) < 0)) return null;
    const cacheKey = JSON.stringify(path);
    const cached = this.locations.get(cacheKey);
    if (cached && (query.kind === 'preview' || query.kind === 'locate')) return query.kind === 'preview' ? previewText(cached) : cached;
    let fallback: ValueLocation | null = null;
    let ticks = 0, deadline = performance.now() + 12;
    this.prepared ??= documentSource(this.source);
    for (const entry of entries(this.prepared)) {
      if (++ticks % 2048 === 0 && performance.now() >= deadline) {
        await new Promise(resolve => setTimeout(resolve, 0)); check(); deadline = performance.now() + 12;
      }
      if (!entry) continue;
      if (query.kind === 'preview' || query.kind === 'locate') {
        if (samePath(entry.path, path)) {
          if (this.locations.size >= 128) this.locations.delete(this.locations.keys().next().value!);
          if (entry.value.length <= 50_000) this.locations.set(cacheKey, entry);
          return query.kind === 'preview' ? previewText(entry) : { path: entry.path, offset: entry.offset, length: entry.length };
        }
        if (query.kind === 'locate' && query.direction && samePath(entry.path, path.slice(0, arrayIndex + 1))) fallback = entry;
      }
    }
    check();
    if (query.kind === 'preview') return { text: null };
    return fallback ? { ...fallback, requestedPath: path } : null;
  }
}
