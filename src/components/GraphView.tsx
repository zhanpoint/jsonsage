import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Background, Controls, Position, ReactFlow, type Edge, type Node as FlowNode } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Node } from 'jsonc-parser';
import { childPath, rawSummary, valueChild, isContainer, type JsonPath } from '../lib/json/views';
import type { GraphItem } from '../lib/json/largeViews';

type GraphData = { label: string; path: JsonPath };
const NODE_LIMIT = 300;
/** A bounded breadth-first layout has predictable cost, including for huge arrays. */
function graphData(root: Node, source: string, maxDepth: number) {
  const nodes: FlowNode<GraphData>[] = [];
  const edges: Edge[] = [];
  const queue: { node: Node; path: JsonPath; depth: number; parent?: string }[] = [{ node: root, path: [], depth: 0 }];
  const levels = new Map<number, number>();
  let truncated = false;
  for (let cursor = 0; cursor < queue.length && cursor < NODE_LIMIT; cursor++) {
    const item = queue[cursor]; const id = String(item.node.offset);
    const index = levels.get(item.depth) ?? 0; levels.set(item.depth, index + 1);
    const count = isContainer(item.node) ? item.node.children?.length ?? 0 : 0;
    nodes.push({ id, sourcePosition: Position.Right, targetPosition: Position.Left, position: { x: item.depth * 270, y: index * 90 }, data: { path: item.path, label: `${item.path.length ? String(item.path.at(-1)) : '$'} · ${item.node.type}\n${rawSummary(source, item.node)}` }, type: 'default' });
    if (item.parent) edges.push({ id: `${item.parent}-${id}`, source: item.parent, target: id, type: 'smoothstep' });
    if (item.depth >= maxDepth) { if (count) truncated = true; continue; }
    const capacity = NODE_LIMIT - queue.length;
    if (count > capacity) truncated = true;
    for (let i = 0; i < Math.min(count, capacity); i++) {
      const child = valueChild(item.node, i);
      queue.push({ node: child, path: childPath(item.node, child, i, item.path), depth: item.depth + 1, parent: id });
    }
  }
  return { nodes, edges, truncated };
}
export default function GraphView({ root, source, onContextPath, language }: { root: Node; source: string; onContextPath: (event: React.MouseEvent, path: JsonPath) => void; language: 'zh' | 'en' }) {
  const [depth, setDepth] = useState(3);
  const { nodes, edges, truncated } = useMemo(() => graphData(root, source, depth), [root, source, depth]);
  return <GraphCanvas nodes={nodes} edges={edges} truncated={truncated} depth={depth} onDepthChange={setDepth} onContextPath={onContextPath} language={language} />;
}
export function GraphCanvas({ nodes: suppliedNodes, edges: suppliedEdges, items, truncated, depth, onDepthChange, onContextPath, language }: {
  nodes?: FlowNode<GraphData>[]; edges?: Edge[]; items?: GraphItem[]; truncated: boolean; depth: number; onDepthChange: (depth: number) => void; onContextPath: (event: React.MouseEvent, path: JsonPath) => void; language: 'zh' | 'en';
}) {
  const nodes = useMemo(() => {
    if (suppliedNodes) return suppliedNodes;
    const levels = new Map<number, number>();
    return (items ?? []).map(item => {
      const index = levels.get(item.depth) ?? 0; levels.set(item.depth, index + 1);
      return { id: item.id, sourcePosition: Position.Right, targetPosition: Position.Left, position: { x: item.depth * 270, y: index * 90 }, type: 'default', data: { path: item.path, label: `${item.path.length ? String(item.path.at(-1)) : '$'} · ${item.type}\n${item.preview}` } };
    });
  }, [suppliedNodes, items]);
  const edges = useMemo(() => suppliedEdges ?? (items ?? []).filter(item => item.parent).map(item => ({ id: `${item.parent}-${item.id}`, source: item.parent!, target: item.id, type: 'smoothstep' })), [suppliedEdges, items]);
  const zh = language === 'zh';
  return <>
    <div className="table-controls"><label>{zh ? '展开深度' : 'Depth'} <span className="select-control"><select value={depth} onChange={event => onDepthChange(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map(value => <option key={value}>{value}</option>)}</select><ChevronDown size={13} aria-hidden="true" /></span></label><span>{nodes.length} {zh ? '个节点' : 'nodes'}{truncated ? (zh ? ' · 部分节点已省略' : ' · Some nodes omitted') : ''}</span></div>
    <div className="graph-surface">
      <ReactFlow key={`${nodes[0]?.id}-${depth}-${nodes.length}`} nodes={nodes} edges={edges} fitView fitViewOptions={{ maxZoom: 1, padding: .15 }} minZoom={.05} maxZoom={2} nodesDraggable={false} nodesConnectable={false} onlyRenderVisibleElements
        onNodeContextMenu={(event, node) => onContextPath(event, node.data.path)}>

        <Background gap={20} size={1} /><Controls position="top-left" orientation="horizontal" showInteractive={false} />
      </ReactFlow>
    </div>
  </>;
}
