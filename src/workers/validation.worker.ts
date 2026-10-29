import { validate, validateIndexed, diagnosticLocations, type JsonOptions } from '../lib/json/engine';
self.onmessage = (event: MessageEvent<{ id: number; source: string; options: JsonOptions }>) => {
  const { id, source, options } = event.data;
  try {
    let lineCount = 1, characterCount = 0;
    for (let i = 0; i < source.length; i++) {
      const code = source.charCodeAt(i);
      if (code === 10) lineCount++;
      else if (code !== 13) {
        characterCount++;
        if (code >= 0xd800 && code <= 0xdbff && source.charCodeAt(i + 1) >= 0xdc00 && source.charCodeAt(i + 1) <= 0xdfff) i++;
      }
    }
    const result = source.trim().length === 0
      ? { ok: false, diagnostics: [], folds: undefined }
      : source.length > 2_000_000 ? validateIndexed(source, options) : { ...validate(source, options), folds: undefined };
    self.postMessage({ id, result: { ...result, diagnostics: diagnosticLocations(source, result.diagnostics), metrics: { lineCount, characterCount } } }, { transfer: result.folds ? [result.folds.buffer] : [] });
  }
  catch { self.postMessage({ id, result: { ok: false, diagnostics: [{ code: 'E001', message: 'Unable to check this document. Reduce its size/depth.', severity: 'error', start: 0, end: 0 }] } }); }
};
