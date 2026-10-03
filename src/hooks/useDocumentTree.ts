import { useEffect, useRef, useState } from 'react';
import type { Node } from 'jsonc-parser';

/** Build the navigable syntax tree off the UI thread and reject stale worker results. */
export function useDocumentTree(source: string | null, jsonc: boolean) {
  const workerRef = useRef<Worker | null>(null);
  const sequence = useRef(0);
  const [result, setResult] = useState<{ source: string | null; jsonc: boolean; root?: Node; error?: boolean } | null>(null);
  useEffect(() => {
    return () => { workerRef.current?.terminate(); workerRef.current = null; };
  }, []);
  useEffect(() => {
    const id = ++sequence.current;
    if (source === null) return;
    try {
      const worker = workerRef.current ?? new Worker(new URL('../workers/tree.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<{ id: number; root?: Node; error?: boolean }>) => {
        if (event.data.id === sequence.current) setResult({ source, jsonc, root: event.data.root, error: event.data.error });
      };
      worker.onerror = () => {
        if (id === sequence.current) setResult({ source, jsonc, error: true });
        worker.terminate(); if (workerRef.current === worker) workerRef.current = null;
      };
      worker.postMessage({ id, source, jsonc });
    } catch { setResult({ source, jsonc, error: true }); }
    return () => { if (sequence.current === id) sequence.current++; workerRef.current?.terminate(); workerRef.current = null; };
  }, [source, jsonc]);
  const current = result?.source === source && result.jsonc === jsonc;
  return { root: current ? result.root : undefined, pending: source !== null && !current, error: current && !!result.error };
}
