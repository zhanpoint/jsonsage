import { largeView, type LargeRequest } from '../lib/json/largeViews';
let source = '';
self.onmessage = (event: MessageEvent<{ source?: string; id?: number; request?: LargeRequest }>) => {
  if (event.data.source !== undefined) source = event.data.source;
  if (event.data.id !== undefined) {
    try { self.postMessage({ id: event.data.id, result: largeView(source, event.data.request!) }); }
    catch { self.postMessage({ id: event.data.id, error: true }); }
  }
};
