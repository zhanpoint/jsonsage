import { decodeInput } from '../lib/json/smartInput';
import { fetchDocument } from '../lib/importDocument';
self.onmessage = async (event: MessageEvent<string>) => {
  try {
    const text = event.data.trim();
    if (/^https?:\/\/\S+$/i.test(text)) {
      const result = await fetchDocument(text, new AbortController().signal);
      self.postMessage({ kind: 'url', source: result });
    } else self.postMessage(decodeInput(event.data));
  } catch { self.postMessage({ error: true }); }
};
