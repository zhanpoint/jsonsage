import { useEffect, useRef, useState } from 'react';
import type { JsonOptions, ValidationResult } from '../lib/json/engine';
type Metrics = { lineCount: number; characterCount: number };
type Result = ValidationResult & { metrics?: Metrics };
type Options = Pick<JsonOptions, 'mode' | 'duplicateKeys'>;
export function useJsonValidation(source: string, options: Options) {
  const mode = options.mode ?? 'strict'; const duplicateKeys = options.duplicateKeys ?? 'warn';
  const worker = useRef<Worker | null>(null);
  const sequence = useRef(0);
  const [result, setResult] = useState<{ source: string; mode: string; duplicateKeys: string; value: Result } | null>(null);
  useEffect(() => {
    const id = ++sequence.current;
    const timer = window.setTimeout(() => {
      const fail = () => {
        if (id === sequence.current) setResult({ source, mode, duplicateKeys, value: { ok: false, diagnostics: [{ code: 'E001', message: 'Unable to check this document. Reload or reduce its size/depth.', severity: 'error', start: 0, end: 0 }] } });
      };
      try {
        const instance = worker.current ?? new Worker(new URL('../workers/validation.worker.ts', import.meta.url), { type: 'module' });
        worker.current = instance;
        instance.onmessage = (event: MessageEvent<{ id: number; result: Result }>) => {
          if (event.data.id === sequence.current) setResult({ source, mode, duplicateKeys, value: event.data.result });
        };
        instance.onerror = () => { instance.terminate(); if (worker.current === instance) worker.current = null; fail(); };
        instance.postMessage({ id, source, options: { mode, duplicateKeys } });
      } catch { fail(); }
    }, 100);
    return () => { window.clearTimeout(timer); if (sequence.current === id) sequence.current++; worker.current?.terminate(); worker.current = null; };
  }, [source, mode, duplicateKeys]);
  const current = result?.source === source && result.mode === mode && result.duplicateKeys === duplicateKeys;
  return { ...(current ? result.value : { ok: false, diagnostics: [] }), metrics: current ? result.value.metrics : undefined, pending: !current };
}
