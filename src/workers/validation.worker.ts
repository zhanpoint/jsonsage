import { validate, diagnosticLocations, type JsonOptions } from '../lib/json/engine';
self.onmessage = (event: MessageEvent<{ id: number; source: string; options: JsonOptions }>) => {
  const { id, source, options } = event.data;
  try {
    let lineCount = 1, characterCount = 0;
    for (const character of source) { if (character === '\n') lineCount++; else if (character !== '\r') characterCount++; }
    const result = validate(source, options);
    self.postMessage({ id, result: { ...result, diagnostics: diagnosticLocations(source, result.diagnostics), metrics: { lineCount, characterCount } } });
  }
  catch { self.postMessage({ id, result: { ok: false, diagnostics: [{ code: 'E001', message: 'Unable to check this document. Reduce its size/depth.', severity: 'error', start: 0, end: 0 }] } }); }
};
