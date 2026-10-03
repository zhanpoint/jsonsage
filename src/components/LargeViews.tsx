import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
import { BRANCH_PAGE_SIZE } from '../lib/json/branches';
import { pathText, type JsonPath } from '../lib/json/views';
import type { ArrayEntry, LargeRequest, LargeResult } from '../lib/json/largeViews';
const GraphCanvas = lazy(() => import('./GraphView').then(module => ({ default: module.GraphCanvas })));
export default function LargeViews({ source, mode, language, onContextPath }: { source: string; mode: 'table' | 'graph'; language: 'zh' | 'en'; onContextPath: (event: React.MouseEvent, path: JsonPath) => void }) {
  const zh = language === 'zh';
  const [arrays, setArrays] = useState<ArrayEntry[]>([]), [selected, setSelected] = useState(0), [page, setPage] = useState(0), [depth, setDepth] = useState(3);
  const [result, setResult] = useState<LargeResult | null>(null), [error, setError] = useState(false), [discovered, setDiscovered] = useState(false);
  const worker = useRef<Worker | null>(null), sequence = useRef(0), loaded = useRef('');
  const busy = useRef(false);
  useEffect(() => { setArrays([]); setSelected(0); setPage(0); setDiscovered(false); }, [source]);
  const path = arrays[selected]?.path;
  const request = useMemo<LargeRequest>(() => mode === 'graph' ? { kind: 'graph', depth } : discovered && path ? { kind: 'table', path, page } : { kind: 'discover' }, [mode, depth, discovered, path, page]);
  useEffect(() => {
    if (mode === 'table' && discovered && !path) return;
    setResult(null); setError(false);
    if (busy.current) { worker.current?.terminate(); worker.current = null; loaded.current = ''; }
    worker.current ??= new Worker(new URL('../workers/largeViews.worker.ts', import.meta.url), { type: 'module' });
    const instance = worker.current, id = ++sequence.current;
    if (loaded.current !== source) { instance.postMessage({ source }); loaded.current = source; }
    instance.onmessage = event => {
      if (event.data.id !== sequence.current) return;
      busy.current = false;
      const next = event.data.result as LargeResult | undefined;
      if (next?.kind === 'discover') { setArrays(next.arrays); setDiscovered(true); }
      else setResult(next ?? null);
      setError(!!event.data.error);
    };
    instance.onerror = () => { if (worker.current !== instance) return; busy.current = false; setError(true); instance.terminate(); worker.current = null; loaded.current = ''; };
    busy.current = true;
    instance.postMessage({ id, request });
  }, [source, request, mode, discovered, path]);
  useEffect(() => () => worker.current?.terminate(), []);
  const scroll = useRef<HTMLDivElement>(null);
  const table = result?.kind === 'table' ? result : null;
  const virtual = useVirtualizer({ count: table?.rows.length ?? 0, getScrollElement: () => scroll.current, estimateSize: () => 36, overscan: 8 });
  useEffect(() => { scroll.current?.scrollTo(0, 0); }, [page, selected]);
  if (result?.kind === 'graph') return <Suspense fallback={<div className="view-message">{zh ? '正在加载节点图…' : 'Loading graph…'}</div>}><GraphCanvas items={result.items} truncated={result.truncated} depth={depth} onDepthChange={setDepth} language={language} onContextPath={onContextPath} /></Suspense>;
  if (mode === 'table' && discovered && !arrays.length) return <div className="view-message">{zh ? '未找到对象数组。' : 'No object arrays found.'}</div>;
  return <>
    {mode === 'table' && arrays.length > 0 && <div className="table-controls"><label>{zh ? '对象数组' : 'Object array'} <span className="select-control"><select value={selected} onChange={event => { setSelected(Number(event.target.value)); setPage(0); }}>{arrays.map((array, index) => <option key={index} value={index}>{pathText(array.path)}</option>)}</select><ChevronDown size={13} /></span></label><span>{arrays[selected]?.count.toLocaleString()} {zh ? '行 · 分页浏览' : 'rows · paged'}</span></div>}
    {!table ? <div className="view-message" role="status">{error ? (zh ? '无法读取数据，请使用代码视图。' : 'Unable to read data. Use Code.') : (zh ? '正在本地读取数据…' : 'Reading data locally…')}</div> : <>
      {table.truncated && <div className="view-caption">{zh ? '最多显示 100 列，其余字段可在树形视图查看。' : 'Showing up to 100 columns. Inspect other fields in Tree.'}</div>}
      <div ref={scroll} className="table-scroll" role="table" aria-label={zh ? 'JSON 数据表格' : 'JSON data table'} aria-rowcount={table.total + 1} aria-colcount={table.headers.length + 1}><div style={{ minWidth: 60 + table.headers.length * 180 }}><div className="data-table-row table-header" role="row"><span role="columnheader" className="table-index">#</span>{table.headers.map(header => <span role="columnheader" key={header}>{header}</span>)}</div><div style={{ height: virtual.getTotalSize(), position: 'relative' }}>{virtual.getVirtualItems().map(item => {
        const row = table.rows[item.index];
        return <div key={row.index} role="row" aria-rowindex={row.index + 2} className="data-table-row" style={{ position: 'absolute', height: item.size, transform: `translateY(${item.start}px)` }}><span role="cell" className="table-index">{row.index}</span>{table.headers.map(header => <span key={header} role="cell" tabIndex={0} onContextMenu={event => onContextPath(event, [...path!, row.index, header])}>{row.cells[header] ?? '—'}</span>)}</div>;
      })}</div></div></div>
      <div className="table-controls"><span>{page + 1} / {Math.ceil(table.total / BRANCH_PAGE_SIZE)}</span><button className="tool-button" disabled={!page} onClick={() => setPage(page - 1)} aria-label={zh ? '上一页' : 'Previous page'}><ArrowLeft size={15} /></button><button className="tool-button" disabled={(page + 1) * BRANCH_PAGE_SIZE >= table.total} onClick={() => setPage(page + 1)} aria-label={zh ? '下一页' : 'Next page'}><ArrowRight size={15} /></button></div>
    </>}
  </>;
}
