import { DocumentInspector, type InspectorRequest } from '../lib/documentInspector';
const inspector = new DocumentInspector();
self.onmessage = ({ data }: MessageEvent<InspectorRequest>) => {
  if (data.kind === 'sync') inspector.sync(data.source, data.revision);
  else if (data.kind === 'change') inspector.change(data.from, data.to, data.insert, data.revision);
  else if (data.kind === 'cancel') inspector.cancel(data.channel);
  else void inspector.query(data.query, data.channel).then(result => {
    self.postMessage({ id: data.id, revision: data.revision, result });
  }).catch(error => {
    self.postMessage({ id: data.id, revision: data.revision, error: error instanceof Error ? error.name : 'Error' });
  });
};
