import { readLocalDocument } from '../lib/importDocument';
self.onmessage = async (event: MessageEvent<File>) => {
  try { self.postMessage({ source: (await readLocalDocument(event.data)).replace(/\r\n?/g, '\n') }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'IMPORT_FAILED' }); }
};
