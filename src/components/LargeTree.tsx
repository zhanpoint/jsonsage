import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowLeft, ArrowRight, ChevronRight, Crosshair } from 'lucide-react';
import { BRANCH_PAGE_SIZE, type BranchResult } from '../lib/json/branches';
import { pathText, type JsonPath } from '../lib/json/views';
export default function LargeTree({ source, language, onContextPath, onLocate }: {
  source: string; language: 'zh' | 'en'; onContextPath: (event: React.MouseEvent, path: JsonPath) => void; onLocate: (start: number, end: number) => void;
}) {
  const zh = language === 'zh';
  const [path, setPath] = useState<JsonPath>([]), [page, setPage] = useState(0), [result, setResult] = useState<BranchResult | null>(null), [error, setError] = useState(false);
  const worker = useRef<Worker | null>(null), sequence = useRef(0), loaded = useRef('');
  const busy = useRef(false);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { setPath([]); setPage(0); }, [source]);
  useEffect(() => {
    setResult(null); setError(false);
    if (busy.current) { worker.current?.terminate(); worker.current = null; loaded.current = ''; }
    worker.current ??= new Worker(new URL('../workers/branch.worker.ts', import.meta.url), { type: 'module' });
    const instance = worker.current, id = ++sequence.current;
    if (loaded.current !== source) { instance.postMessage({ source }); loaded.current = source; }
    instance.onmessage = event => { if (event.data.id === sequence.current) { busy.current = false; setResult(event.data.result ?? null); setError(!!event.data.error); } };
    instance.onerror = () => { if (worker.current !== instance) return; busy.current = false; setError(true); instance.terminate(); worker.current = null; loaded.current = ''; };
    busy.current = true;
    instance.postMessage({ id, path, page });
    scroll.current?.scrollTo(0, 0);
  }, [source, path, page]);
  useEffect(() => () => worker.current?.terminate(), []);
  const rows = result?.rows ?? [];
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroll.current, estimateSize: () => 36, overscan: 8 });
  const browse = (next: JsonPath) => { setPath(next); setPage(0); };
  return <div className="large-tree">
    <div className="table-controls"><button className="tool-button" disabled={!path.length} onClick={() => browse(path.slice(0, -1))} aria-label={zh ? '上一级' : 'Parent'}><ArrowLeft size={15} /></button><code>{pathText(path)}</code><span>{zh ? '大文件按分支浏览' : 'Browse large files by branch'}</span>{result && <button className="tool-button" aria-label={zh ? '在代码中定位分支' : 'Locate branch in code'} onClick={() => onLocate(result.parent.offset, result.parent.offset + result.parent.length)}><Crosshair size={15} /></button>}</div>
    <div className="tree-scroll" ref={scroll} aria-label={zh ? '大文件节点列表' : 'Large file nodes'}>
      {!result && <div className="view-message" role="status">{error ? (zh ? '无法读取此分支，请使用代码视图。' : 'Unable to read this branch. Use Code.') : (zh ? '正在本地读取分支…' : 'Reading branch locally…')}</div>}
      {result && !rows.length && <div className="view-message">{result.parent.type === 'array' || result.parent.type === 'object' ? (zh ? '此节点为空' : 'Empty node') : result.parent.preview}</div>}
      <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>{virtual.getVirtualItems().map(item => {
        const row = rows[item.index], container = row.type === 'array' || row.type === 'object';
        return <div key={row.offset} className="tree-row" style={{ position: 'absolute', width: '100%', height: item.size, transform: `translateY(${item.start}px)`, paddingLeft: 14 }} onContextMenu={event => onContextPath(event, row.path)}>
          <button className="node-toggle" disabled={!container} aria-label={`${zh ? '展开' : 'Expand'} ${row.label}`} onClick={() => browse(row.path)}><ChevronRight size={14} style={{ visibility: container ? 'visible' : 'hidden' }} /></button><span className="node-key">{row.label}</span><span className={`node-type type-${row.type}`}>{row.type}</span><span className="node-value">{row.preview}</span><div className="node-actions"><button className="tool-button" onClick={() => onLocate(row.offset, row.offset + row.length)} aria-label={zh ? '在代码中定位节点' : 'Locate in code'}><Crosshair size={14} /></button></div>
        </div>;
      })}</div>
    </div>
    {result && <div className="table-controls"><span>{result.total.toLocaleString()} {zh ? '个直接子节点' : 'direct children'} · {page + 1} / {Math.max(1, Math.ceil(result.total / BRANCH_PAGE_SIZE))}</span><button className="tool-button" disabled={!page} onClick={() => setPage(page - 1)} aria-label={zh ? '上一页' : 'Previous page'}><ArrowLeft size={15} /></button><button className="tool-button" disabled={(page + 1) * BRANCH_PAGE_SIZE >= result.total} onClick={() => setPage(page + 1)} aria-label={zh ? '下一页' : 'Next page'}><ArrowRight size={15} /></button></div>}
  </div>;
}
