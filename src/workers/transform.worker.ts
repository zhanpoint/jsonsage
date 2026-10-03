import { beautifyJson, minifyJson, escapeJsonText, unescapeJsonText, type Indent } from '../lib/json/transforms';
import { repairJson } from '../lib/json/repair';
import type { JsonOptions } from '../lib/json/engine';
import { maskJson } from '../lib/json/privacy';
self.onmessage = (event: MessageEvent<{ id: number; action: 'format' | 'minify' | 'repair' | 'escape' | 'unescape' | 'mask'; source: string; indent: Indent; options: JsonOptions }>) => {
  const { id, action, source, indent, options } = event.data;
  try {
    let result = action === 'mask' ? maskJson(source, options) : action === 'escape' ? { ok: true, source: escapeJsonText(source) } : action === 'unescape' ? unescapeJsonText(source) : action === 'repair' ? repairJson(source, options) : action === 'format' ? beautifyJson(source, indent, options) : minifyJson(source, options);
    if (action === 'repair' && result.ok && 'changed' in result && result.changed) {
      const formatted = beautifyJson(result.source, indent, options);
      if (formatted.ok) result = { ...result, source: formatted.source };
    }
    self.postMessage({ id, result });
  } catch { self.postMessage({ id, result: { ok: false, source } }); }
};
