import { documentPath } from '../lib/json/document';
let source = '';
self.onmessage = (event: MessageEvent<{ source?: string; id?: number; offset?: number }>) => {
  if (event.data.source !== undefined) source = event.data.source;
  if (event.data.id !== undefined) {
    try { self.postMessage({ id: event.data.id, path: documentPath(source, event.data.offset!) }); }
    catch { self.postMessage({ id: event.data.id, path: [] }); }
  }
};
