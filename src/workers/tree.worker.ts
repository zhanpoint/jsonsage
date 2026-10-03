import { visit } from 'jsonc-parser';
import { documentTree } from '../lib/json/views';
self.onmessage = (event: MessageEvent<{ id: number; source: string; jsonc: boolean }>) => {
  const { id, source, jsonc } = event.data;
  try {
    let nodes = 0; let depth = 0;
    const count = () => { if (++nodes > 100_000) throw new Error('Structure too large'); };
    const enter = () => { count(); if (++depth > 256) throw new Error('Structure too deep'); };
    visit(source, {
      onObjectBegin: enter, onArrayBegin: enter,
      onObjectEnd: () => { depth--; }, onArrayEnd: () => { depth--; },
      onObjectProperty: () => { count(); count(); }, onLiteralValue: count,
    }, { allowTrailingComma: jsonc, disallowComments: !jsonc });
    // Node parent references are preserved by structured cloning; values retain raw offsets.
    self.postMessage({ id, root: documentTree(source, jsonc) });
  } catch {
    self.postMessage({ id, error: true });
  }
};
