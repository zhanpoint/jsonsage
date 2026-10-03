import { branch } from '../lib/json/branches';
import type { JsonPath } from '../lib/json/views';
let source = '';
self.onmessage = (event: MessageEvent<{ source?: string; id?: number; path?: JsonPath; page?: number }>) => {
  if (event.data.source !== undefined) source = event.data.source;
  if (event.data.id !== undefined) {
    try { self.postMessage({ id: event.data.id, result: branch(source, event.data.path!, event.data.page) }); }
    catch { self.postMessage({ id: event.data.id, error: true }); }
  }
};
