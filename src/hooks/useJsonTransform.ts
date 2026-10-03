import { useCallback, useEffect, useRef, useState } from 'react';
import type { JsonOptions } from '../lib/json/engine';
import type { Indent } from '../lib/json/transforms';
type Action = 'format' | 'minify' | 'repair' | 'escape' | 'unescape' | 'mask';
type Result = { ok: boolean; source: string; changed?: boolean; commentsMoved?: boolean };
export function useJsonTransform(source: string, indent: Indent, options: JsonOptions) {
  const worker = useRef<Worker | null>(null);
  const sequence = useRef(0);
  const latest = useRef({ source, indent, mode: options.mode });
  latest.current = { source, indent, mode: options.mode };
  const [busy, setBusy] = useState(false);
  const cancel = useCallback(() => { sequence.current++; worker.current?.terminate(); worker.current = null; setBusy(false); }, []);
  useEffect(() => () => { sequence.current++; worker.current?.terminate(); }, []);
  useEffect(cancel, [source, indent, options.mode, cancel]);
  function run(action: Action, done: (result: Result) => void) {
    if (busy) return;
    const id = ++sequence.current;
    const snapshot = latest.current;
    setBusy(true);
    const finish = (result: Result) => {
      if (id !== sequence.current) return;
      setBusy(false);
      if (latest.current.source === snapshot.source && latest.current.mode === snapshot.mode && latest.current.indent === snapshot.indent) done(result);
    };
    try {
      const instance = worker.current ?? new Worker(new URL('../workers/transform.worker.ts', import.meta.url), { type: 'module' });
      worker.current = instance;
      instance.onmessage = event => { if (event.data.id === id) finish(event.data.result); };
      instance.onerror = () => { instance.terminate(); worker.current = null; finish({ ok: false, source }); };
      instance.postMessage({ id, action, source, indent, options });
    } catch { finish({ ok: false, source }); }
  }
  return { run, busy, cancel };
}
