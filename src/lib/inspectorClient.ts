import { documentChange } from './codeEditor';
import type { InspectorQuery, InspectorRequest, InspectorResponse, InspectorResults } from './documentInspector';

/** One lazy worker per workspace; paths and queries never resend the document. */
export class InspectorClient {
  private worker: Worker | null = null;
  private source = '';
  private revision = 0;
  private sequence = 0;
  private pending = new Map<number, { channel: string; resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  sync(source: string) {
    if (source === this.source) return;
    const change = this.worker ? documentChange(this.source, source) : null;
    this.source = source; this.revision++;
    for (const item of this.pending.values()) item.reject(new DOMException('Superseded', 'AbortError'));
    this.pending.clear();
    if (change) this.send({ kind: 'change', revision: this.revision, ...change });
  }
  private send(message: InspectorRequest) { this.worker!.postMessage(message); }
  cancel(channel: string) {
    for (const [id, item] of this.pending) if (item.channel === channel) { item.reject(new DOMException('Superseded', 'AbortError')); this.pending.delete(id); }
    if (this.worker) this.send({ kind: 'cancel', channel });
  }
  query<K extends InspectorQuery['kind']>(query: Extract<InspectorQuery, { kind: K }>, channel = query.kind as string): Promise<InspectorResults[K]> {
    this.cancel(channel);
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/inspector.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }: MessageEvent<InspectorResponse>) => {
        const item = this.pending.get(data.id);
        if (!item) return;
        this.pending.delete(data.id);
        if (data.revision !== this.revision || data.error) item.reject(new DOMException(data.error ?? 'Superseded', data.error ?? 'AbortError'));
        else item.resolve(data.result);
      };
      this.worker.onerror = () => this.dispose();
      this.send({ kind: 'sync', revision: this.revision, source: this.source });
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { channel, resolve: value => resolve(value as InspectorResults[K]), reject });
      this.send({ kind: 'query', id, channel, revision: this.revision, query });
    });
  }
  dispose() {
    this.worker?.terminate(); this.worker = null;
    for (const item of this.pending.values()) item.reject(new Error('Worker unavailable'));
    this.pending.clear();
  }
}
