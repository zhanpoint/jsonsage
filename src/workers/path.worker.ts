import { getLocation } from 'jsonc-parser';
let source = '';
self.onmessage = (event: MessageEvent<{ source?: string; id?: number; offset?: number }>) => {
  if (event.data.source !== undefined) source = event.data.source;
  if (event.data.id !== undefined) {
    try { self.postMessage({ id: event.data.id, path: getLocation(source, event.data.offset!).path }); }
    catch { self.postMessage({ id: event.data.id, path: [] }); }
  }
};
