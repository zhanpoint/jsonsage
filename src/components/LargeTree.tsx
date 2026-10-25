import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowLeft, ArrowRight, Crosshair } from 'lucide-react';
import { TREE_PAGE_SIZE, type TreeExpansion, type TreePage } from '../lib/json/treePage';
import type { TreeFoldRequest } from './StructuredViews';
import { type JsonPath } from '../lib/json/views';
import { TreeBranches, TreeNode, TREE_INDENT, TREE_MAX_DEPTH, TREE_ROW_HEIGHT } from './TreeNode';
import { HelpTooltip } from './ui/HelpTooltip';
export default function LargeTree({ source, language, onContextPath, onLocate, treeFold }: {
  treeFold?: TreeFoldRequest | null; source: string; language: 'zh' | 'en'; onContextPath: (event: React.MouseEvent, path: JsonPath) => void; onLocate: (start: number, end: number) => void;
}) {
  const zh = language === 'zh';
  const [expansion, setExpansion] = useState<TreeExpansion>({ all: false, root: true, offsets: [] }), [page, setPage] = useState(0), [result, setResult] = useState<TreePage | null>(null), [error, setError] = useState(false);
  const worker = useRef<Worker | null>(null), sequence = useRef(0), loaded = useRef('');
  const busy = useRef(false);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { setExpansion({ all: false, root: true, offsets: [] }); setPage(0); }, [source]);
  useEffect(() => { if (treeFold) { setExpansion({ all: !treeFold.folded, root: false, offsets: [] }); setPage(0); } }, [treeFold]);
  useEffect(() => {
    setResult(null); setError(false);
    if (busy.current) { worker.current?.terminate(); worker.current = null; loaded.current = ''; }
    worker.current ??= new Worker(new URL('../workers/pagedTree.worker.ts', import.meta.url), { type: 'module' });
    const instance = worker.current, id = ++sequence.current;
    if (loaded.current !== source) { instance.postMessage({ source }); loaded.current = source; }
    instance.onmessage = event => { if (event.data.id === sequence.current) { busy.current = false; setResult(event.data.result ?? null); setError(!!event.data.error); } };
    instance.onerror = () => { if (worker.current !== instance) return; busy.current = false; setError(true); instance.terminate(); worker.current = null; loaded.current = ''; };
    busy.current = true;
    instance.postMessage({ id, expansion, page });
    scroll.current?.scrollTo(0, 0);
  }, [source, expansion, page]);
  useEffect(() => () => worker.current?.terminate(), []);
  const rows = result?.rows ?? [];
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroll.current, estimateSize: () => TREE_ROW_HEIGHT, overscan: 8 });
  const toggle = (offset: number) => { setExpansion(previous => {
    const offsets = new Set(previous.offsets);
    if (offsets.has(offset)) offsets.delete(offset); else offsets.add(offset);
    return { ...previous, offsets: [...offsets] };
  }); setPage(0); };
  return <div className="large-tree">
    <div className="tree-scroll" ref={scroll} role="tree" aria-label={zh ? '大文件节点树' : 'Large file tree'}>
      {!result && <div className="view-message" role="status">{error ? (zh ? '无法读取节点，请使用代码视图。' : 'Unable to read nodes. Use Code.') : (zh ? '正在本地读取节点…' : 'Reading nodes locally…')}</div>}
      <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>{virtual.getVirtualItems().map(item => {
        const row = rows[item.index], container = row.type === 'array' || row.type === 'object';
        return <div key={row.offset} className="tree-row" role="treeitem" aria-level={row.depth + 1} aria-expanded={container ? row.expanded : undefined} tabIndex={0} style={{ position: 'absolute', width: '100%', height: item.size, transform: `translateY(${item.start}px)`, paddingLeft: 12 + Math.min(row.depth, TREE_MAX_DEPTH) * TREE_INDENT }} onDoubleClick={event => { if (container && !(event.target as HTMLElement).closest('button')) toggle(row.offset); }} onKeyDown={event => { if (event.target === event.currentTarget && container && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggle(row.offset); } }} onContextMenu={event => onContextPath(event, row.path)}>
          <TreeBranches depth={row.depth} last={row.last} expanded={container && row.expanded} leaf={!container} />
          <TreeNode type={row.type} label={row.label} index={typeof row.path.at(-1) === 'number'} preview={row.preview} expanded={row.expanded} expandable={container} language={language} onToggle={() => toggle(row.offset)} />
          <div className="node-actions"><HelpTooltip label={zh ? '在代码中定位节点' : 'Locate in code'}><button data-tone="blue" className="tool-button" onClick={() => onLocate(row.offset, row.offset + row.length)} aria-label={zh ? '在代码中定位节点' : 'Locate in code'}><Crosshair size={14} /></button></HelpTooltip></div>
        </div>;
      })}</div>
    </div>
    {result && result.total > TREE_PAGE_SIZE && <div className="table-controls"><span>{result.total.toLocaleString()} {zh ? '个可见节点' : 'visible nodes'} · {page + 1} / {Math.max(1, Math.ceil(result.total / TREE_PAGE_SIZE))}</span><button className="tool-button" disabled={!page} onClick={() => setPage(page - 1)} aria-label={zh ? '上一页' : 'Previous page'}><ArrowLeft size={15} /></button><button className="tool-button" disabled={(page + 1) * TREE_PAGE_SIZE >= result.total} onClick={() => setPage(page + 1)} aria-label={zh ? '下一页' : 'Next page'}><ArrowRight size={15} /></button></div>}
  </div>;
}
