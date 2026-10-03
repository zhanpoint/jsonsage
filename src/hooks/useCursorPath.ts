import { useCallback, useEffect, useRef, useState } from 'react';
import type { Node } from 'jsonc-parser';
import { pathAtOffset, type JsonPath } from '../lib/json/views';
export function useCursorPath(source: string, root: Node | null | undefined) {
  const [path, setPath] = useState<JsonPath>([]);
  const latest = useRef({ source, root }); latest.current = { source, root };
  const offset = useRef(0), sequence = useRef(0), worker = useRef<Worker | null>(null), workerSource = useRef('');
  type Job = { id: number; position: number; source: string; done: (path: JsonPath) => void };
  const queued = useRef<Job | null>(null), active = useRef<Job | null>(null);
  const drain = useRef<() => void>(() => {});
  drain.current = () => {
    const job = queued.current;
    if (!job || active.current) return;
    queued.current = null; active.current = job;
    worker.current ??= new Worker(new URL('../workers/path.worker.ts', import.meta.url), { type: 'module' });
    const instance = worker.current;
    if (workerSource.current !== job.source) { instance.postMessage({ source: job.source }); workerSource.current = job.source; }
    instance.onmessage = event => {
      if (worker.current !== instance || active.current?.id !== event.data.id) return;
      active.current = null;
      if (job.id === sequence.current && job.source === latest.current.source) job.done(event.data.path);
      drain.current();
    };
    instance.onerror = () => { instance.terminate(); if (worker.current === instance) { worker.current = null; active.current = null; workerSource.current = ''; drain.current(); } };
    instance.postMessage({ id: job.id, offset: job.position });
  };
  const set = useCallback((next: JsonPath) => setPath(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next), []);
  const resolve = useCallback((position: number, done: (path: JsonPath) => void) => {
    const id = ++sequence.current;
    const { source, root } = latest.current;
    if (root) { queued.current = null; done(pathAtOffset(root, position)); return; }
    if (active.current && workerSource.current !== source) { worker.current?.terminate(); worker.current = null; active.current = null; workerSource.current = ''; }
    // Keep one active request and only the latest pending cursor position.
    queued.current = { id, position, source, done }; drain.current();
  }, []);
  const select = useCallback((position: number) => { offset.current = position; resolve(position, set); }, [resolve, set]);
  useEffect(() => { select(offset.current); }, [source, root, select]);
  useEffect(() => () => { sequence.current++; worker.current?.terminate(); worker.current = null; queued.current = null; }, []);
  return { path, set, select, resolve };
}
