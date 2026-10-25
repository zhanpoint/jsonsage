import { readPreviewText } from '../lib/textPreview';
import type { JsonPath } from '../lib/json/views';

self.onmessage = (event: MessageEvent<{ source: string; path: JsonPath }>) => {
  try { self.postMessage({ text: readPreviewText(event.data.source, event.data.path) }); }
  catch { self.postMessage({ error: true }); }
};
