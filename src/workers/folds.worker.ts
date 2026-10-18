import { indexJsonFolds } from '../lib/json/foldIndex';
self.onmessage = (event: MessageEvent<string>) => {
  const ranges = indexJsonFolds(event.data);
  self.postMessage(ranges, { transfer: [ranges.buffer] });
};
