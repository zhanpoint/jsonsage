import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Braces, Brackets, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import { findNodeAtLocation, type Node } from 'jsonc-parser';
import { childPath, editNode, findObjectArrays, flattenTree, isContainer, pathText, rawSummary, tableHeaders, type JsonPath, type ViewRow } from '../lib/json/views';
import type { Indent } from '../lib/json/transforms';
import type { JsonOptions } from '../lib/json/engine';
const GraphView = lazy(() => import('./GraphView'));
export type StructuredProps = {
  root: Node; source: string; view: 'tree' | 'table' | 'graph'; language: 'zh' | 'en';
  indent: Indent; options: JsonOptions; editable: boolean;
  selectedPath?: JsonPath; onSelect?: (node: Node, path: JsonPath, focusEditor?: boolean) => void;
  onChange: (source: string) => void; onContextPath: (event: React.MouseEvent, path: JsonPath) => void;
};
const types: Record<string, string> = { string: 'String', number: 'Number', boolean: 'Boolean', null: 'Null', object: 'Object', array: 'Array' };

export default memo(function StructuredViews(props: StructuredProps) {
  if (props.view === 'graph') return <Suspense fallback={<div className="view-message">{props.language === 'zh' ? '正在加载节点图…' : 'Loading graph…'}</div>}><GraphView root={props.root} source={props.source} onContextPath={props.onContextPath} language={props.language} /></Suspense>;
  return props.view === 'tree' ? <TreeView {...props} /> : <TableView {...props} />;
});
function TreeView({ root, source, language, indent, options, editable, onChange, onContextPath, selectedPath, onSelect }: StructuredProps) {
  const zh = language === 'zh';
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([root.offset]));
  const [editing, setEditing] = useState<{ row: ViewRow; operation: 'replace' | 'add' | 'delete' } | null>(null);
  const [raw, setRaw] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!editing) return;
    dialogRef.current?.showModal();
    dialogRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')?.focus();
  }, [editing]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { rows, truncated } = useMemo(() => flattenTree(root, expanded), [root, expanded]);
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => 36, overscan: 8 });
  const selectedNode = selectedPath ? findNodeAtLocation(root, selectedPath) : undefined;
  const reveal = useRef<Node | undefined>(undefined);
  useEffect(() => {
    reveal.current = selectedNode;
    if (!selectedNode) return;
    setExpanded(previous => {
      const next = new Set(previous);
      for (let parent = selectedNode.parent; parent; parent = parent.parent) if (isContainer(parent)) next.add(parent.offset);
      return next.size === previous.size ? previous : next;
    });
  }, [selectedNode]);
  useEffect(() => {
    if (!selectedNode || reveal.current !== selectedNode) return;
    const index = rows.findIndex(row => row.node === selectedNode);
    if (index >= 0) { virtual.scrollToIndex(index, { align: 'auto', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); reveal.current = undefined; }
  }, [selectedNode, rows, virtual]);
  function open(row: ViewRow, operation: 'replace' | 'add' | 'delete') {
    setEditing({ row, operation }); setError(''); setKey('');
    setRaw(operation === 'replace' ? source.slice(row.node.offset, row.node.offset + row.node.length) : 'null');
  }
  function submit() {
    if (!editing) return;
    try {
      const next = editNode(source, editing.row.node, editing.operation, raw, key, indent, options);
      onChange(next); setEditing(null); setExpanded(new Set([root.offset]));
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      setError(code === 'DUPLICATE_KEY' ? (zh ? '字段名已存在。' : 'This key already exists.') : (zh ? '请输入符合当前 JSON/JSONC 模式的值。' : 'Enter a valid value for the current JSON/JSONC mode.'));
    }
  }
  return <>
    {(!editable || truncated) && <div className="view-caption">{!editable && <span>{zh ? '重复键文档为只读，避免路径歧义。' : 'Duplicate-key documents are read-only to avoid ambiguous paths.'}</span>}{truncated && <span>{zh ? ' 当前展开最多显示 50,000 个节点，请折叠其他分支。' : 'Showing up to 50,000 expanded nodes; collapse other branches.'}</span>}</div>}
    <div className="tree-scroll" ref={scrollRef} role="tree" aria-label={zh ? 'JSON 节点树' : 'JSON tree'}>
      <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map(item => {
          const row = rows[item.index]; const container = isContainer(row.node); const openState = expanded.has(row.node.offset);
          return <div key={row.id} className="tree-row" data-tree-index={item.index} role="treeitem" aria-selected={row.node === selectedNode} aria-level={row.depth + 1} aria-expanded={container ? openState : undefined} tabIndex={0}
            style={{ position: 'absolute', top: 0, transform: `translateY(${item.start}px)`, height: item.size, width: '100%', paddingLeft: 12 + Math.min(row.depth, 40) * 18 }}
            onClick={event => { if (!(event.target as HTMLElement).closest('button')) onSelect?.(row.node, row.path); }}
            onFocus={event => { if (event.target === event.currentTarget) onSelect?.(row.node, row.path, false); }}
            onContextMenu={event => onContextPath(event, row.path)} onKeyDown={event => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const index = Math.max(0, Math.min(rows.length - 1, item.index + (event.key === 'ArrowDown' ? 1 : -1)));
                virtual.scrollToIndex(index, { align: 'auto' });
                requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLElement>(`[data-tree-index="${index}"]`)?.focus());
                return;
              }
              if (container && ['Enter', 'ArrowRight', 'ArrowLeft'].includes(event.key)) { event.preventDefault(); setExpanded(previous => { const next = new Set(previous); if (event.key === 'ArrowLeft' || (event.key === 'Enter' && next.has(row.node.offset))) next.delete(row.node.offset); else next.add(row.node.offset); return next; }); }
            }}>
            {row.depth > 0 && <span className="tree-guides" aria-hidden="true" style={{ width: Math.min(row.depth, 40) * 18 }} />}
            <button className="node-toggle" disabled={!container} aria-label={`${openState ? (zh ? '折叠' : 'Collapse') : (zh ? '展开' : 'Expand')} ${row.label}`} onClick={() => setExpanded(previous => { const next = new Set(previous); next.has(row.node.offset) ? next.delete(row.node.offset) : next.add(row.node.offset); return next; })}><ChevronRight size={14} style={{ transform: openState ? 'rotate(90deg)' : undefined, visibility: container ? 'visible' : 'hidden' }} /></button>
            {container && (row.node.type === 'object' ? <Braces className="node-container-icon" size={15} aria-hidden="true" /> : <Brackets className="node-container-icon" size={15} aria-hidden="true" />)}
            <span className={`node-key${container ? ' node-key-container' : ''}`}>{row.label}</span>
            <span className={`node-type type-${row.node.type}`}>{types[row.node.type]}</span>
            <span className={`node-value${container ? ' node-count' : ''}`}>{container ? `${row.node.children?.length ?? 0} ${zh ? (row.node.type === 'object' ? '个字段' : '项') : (row.node.type === 'object' ? 'fields' : 'items')}` : rawSummary(source, row.node)}</span>
            <div className="node-actions">
              <button data-tone="blue" disabled={!editable} className="tool-button" aria-label={zh ? '编辑节点' : 'Edit node'} data-tooltip={zh ? '编辑节点' : 'Edit node'} onClick={() => open(row, 'replace')}><Pencil size={13} /></button>
              {container && <button data-tone="green" disabled={!editable} className="tool-button" aria-label={zh ? '添加子节点' : 'Add child'} data-tooltip={zh ? '添加子节点' : 'Add child'} onClick={() => open(row, 'add')}><Plus size={14} /></button>}
              {row.depth > 0 && <button data-tone="red" disabled={!editable} className="tool-button" aria-label={zh ? '删除节点' : 'Delete node'} data-tooltip={zh ? '删除节点' : 'Delete node'} onClick={() => open(row, 'delete')}><Trash2 size={13} /></button>}
            </div>
          </div>;
        })}
      </div>
    </div>
    {editing && <dialog ref={dialogRef} className="node-dialog" aria-label={zh ? '编辑 JSON 节点' : 'Edit JSON node'} onCancel={() => setEditing(null)} onKeyDown={event => { if (event.key === 'Escape') setEditing(null); }}>
      <form onSubmit={event => { event.preventDefault(); submit(); }}>
        <div className="node-dialog-title"><strong>{editing.operation === 'delete' ? (zh ? '确认删除节点' : 'Confirm deletion') : editing.operation === 'add' ? (zh ? '添加节点' : 'Add node') : (zh ? '编辑节点' : 'Edit node')}</strong><button type="button" className="tool-button" aria-label={zh ? '关闭' : 'Close'} onClick={() => setEditing(null)}><X size={16} /></button></div>
        {editing.operation === 'delete' && <code>{pathText(editing.row.path)}</code>}
        {editing.operation === 'add' && editing.row.node.type === 'object' && <label>{zh ? '字段名' : 'Key'}<input autoFocus value={key} onChange={event => setKey(event.target.value)} /></label>}
        {editing.operation !== 'delete' && <textarea aria-label={zh ? '节点值' : 'Node value'} value={raw} onChange={event => setRaw(event.target.value)} spellCheck={false} />}
        {error && <p role="alert">{error}</p>}
        <div className="node-dialog-buttons"><button type="button" onClick={() => setEditing(null)}>{zh ? '取消' : 'Cancel'}</button><button type="submit">{zh ? '确认' : 'Confirm'}</button></div>
      </form>
    </dialog>}
  </>;
}
function TableView({ root, source, language, onContextPath }: StructuredProps) {
  const zh = language === 'zh'; const scrollRef = useRef<HTMLDivElement>(null);
  const arrays = useMemo(() => findObjectArrays(root), [root]);
  const [selected, setSelected] = useState(0);
  const array = arrays[Math.min(selected, arrays.length - 1)];
  const { headers, truncated } = useMemo(() => array ? tableHeaders(array.node) : { headers: [], truncated: false }, [array]);
  const count = array?.node.children?.length ?? 0;
  const virtual = useVirtualizer({ count, getScrollElement: () => scrollRef.current, estimateSize: () => 36, overscan: 8 });
  if (!array) return <div className="view-message">{zh ? '在扫描范围内未找到对象数组。表格适用于 [{"name":"…"}, …]；请使用树形视图查看其他结构。' : 'No object arrays found in the scan range. Tables display [{"name":"…"}, …]; use Tree for other structures.'}</div>;
  return <>
    <div className="table-controls"><label>{zh ? '对象数组' : 'Object array'} <select value={Math.min(selected, arrays.length - 1)} onChange={event => { setSelected(Number(event.target.value)); scrollRef.current?.scrollTo(0, 0); }}>{arrays.map((entry, i) => <option value={i} key={entry.id}>{pathText(entry.path)}</option>)}</select></label><span>{count.toLocaleString()} {zh ? '行' : 'rows'} · {headers.length} {zh ? '列' : 'columns'}</span></div>
    {truncated && <div className="view-caption">{zh ? '最多展示 100 列，其余字段可在树形视图查看。' : 'Showing up to 100 columns; inspect other fields in Tree.'}</div>}
    <div className="table-scroll" ref={scrollRef} role="table" aria-label={zh ? 'JSON 数据表格' : 'JSON data table'} aria-rowcount={count + 1} aria-colcount={headers.length + 1}>
      <div style={{ minWidth: 60 + headers.length * 180 }}>
        <div className="data-table-row table-header" role="row"><span role="columnheader" className="table-index">#</span>{headers.map(header => <span role="columnheader" key={header}>{header}</span>)}</div>
        <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
          {virtual.getVirtualItems().map(item => {
            const node = array.node.children![item.index]; const rowPath = childPath(array.node, node, item.index, array.path);
            const cells = new Map((node.children ?? []).map(property => [String(property.children![0].value), property.children![1]]));
            return <div className="data-table-row" role="row" aria-rowindex={item.index + 2} key={item.index} style={{ position: 'absolute', top: 0, transform: `translateY(${item.start}px)`, height: item.size }}><span className="table-index" role="cell">{item.index}</span>{headers.map(header => { const value = cells.get(header); return <span role="cell" key={header} tabIndex={0} onContextMenu={event => onContextPath(event, [...rowPath, header])}>{value ? rawSummary(source, value) : '—'}</span>; })}</div>;
          })}
        </div>
      </div>
    </div>
  </>;
}
