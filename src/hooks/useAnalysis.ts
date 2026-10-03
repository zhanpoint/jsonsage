import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisRequest, AnalysisResult } from '../lib/json/analysis';

export function useAnalysis() {
  const worker = useRef<Worker | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');
  const cancel = useCallback(() => { worker.current?.terminate(); worker.current = null; setBusy(false); }, []);
  const reset = useCallback(() => { cancel(); setResult(null); setError(''); }, [cancel]);
  useEffect(() => () => worker.current?.terminate(), []);
  function run(request: AnalysisRequest) {
    reset();
    setBusy(true);
    try {
      const instance = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' });
      worker.current = instance;
      instance.onmessage = event => {
        if (worker.current !== instance) return;
        setResult(event.data.result ?? null); setError(event.data.error ?? ''); cancel();
      };
      instance.onerror = () => { if (worker.current === instance) { setError('ANALYSIS_FAILED'); cancel(); } };
      instance.postMessage(request);
    } catch { setError('ANALYSIS_FAILED'); cancel(); }
  }
  return { run, cancel, reset, busy, result, error };
}
