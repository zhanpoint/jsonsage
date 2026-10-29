import { MATCH_LIMIT, SearchDocument, type SearchRequest, type SearchResult } from '../lib/searchMatches';

const document = new SearchDocument();
let timer: ReturnType<typeof setTimeout> | undefined;

self.onmessage = ({ data }: MessageEvent<SearchRequest>) => {
  clearTimeout(timer);
  if (data.kind === 'cancel') return;
  if (data.kind === 'init') { document.reset(data.source); return; }
  if (data.kind === 'change') { document.change(data.changes); return; }
  const id = data.id;
  const cursor = document.cursor(data.query);
  let count = 0;
  function scan() {
    const deadline = performance.now() + 8;
    while (performance.now() < deadline) {
      const match = cursor.next();
      if (match.done || count === MATCH_LIMIT) {
        const result: SearchResult = { id, count, truncated: !match.done };
        self.postMessage(result);
        return;
      }
      count++;
    }
    timer = setTimeout(scan, 0);
  }
  timer = setTimeout(scan, 0);
};
