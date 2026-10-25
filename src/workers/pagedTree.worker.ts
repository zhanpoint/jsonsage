import { treePage, type TreeExpansion } from '../lib/json/treePage';
let source = '';
self.onmessage = (event: MessageEvent<{ source?: string; id?: number; expansion: TreeExpansion; page: number }>) => {
  if (event.data.source !== undefined) source = event.data.source;
  if (event.data.id !== undefined) {
    try { self.postMessage({ id: event.data.id, result: treePage(source, event.data.expansion, event.data.page) }); }
    catch { self.postMessage({ id: event.data.id, error: true }); }
  }
};
