import { Braces, Brackets, CaseSensitive, CircleSlash, Hash, Minus, Plus, ToggleRight, type LucideIcon } from 'lucide-react';

export const TREE_ROW_HEIGHT = 28;
export const TREE_INDENT = 20;
export const TREE_MAX_DEPTH = 40;
const icons: Record<string, LucideIcon> = { object: Braces, array: Brackets, string: CaseSensitive, number: Hash, boolean: ToggleRight, null: CircleSlash };

/** Draw real sibling branches, including ancestors outside the virtual viewport. */
export function TreeBranches({ depth, last, branches = 0n, expanded = false, leaf = false }: { depth: number; last: boolean; branches?: bigint; expanded?: boolean; leaf?: boolean }) {
  const levels = Math.min(depth, TREE_MAX_DEPTH);
  if (!levels && !expanded) return null;
  const middle = TREE_ROW_HEIGHT / 2;
  let lines = '';
  for (let level = 0; level < levels - 1; level++) {
    if (branches & (1n << BigInt(level))) lines += `M${level * TREE_INDENT + 8} 0v${TREE_ROW_HEIGHT}`;
  }
  if (levels) {
    const left = (levels - 1) * TREE_INDENT + 8;
    lines += `M${left} 0v${last ? middle : TREE_ROW_HEIGHT}M${left} ${middle}H${levels * TREE_INDENT + (leaf ? 22 : 0)}`;
  }
  if (expanded) lines += `M${levels * TREE_INDENT + 8} ${middle}V${TREE_ROW_HEIGHT}`;
  return <svg className="tree-branches" width={(levels + 1) * TREE_INDENT} height={TREE_ROW_HEIGHT} aria-hidden="true"><path d={lines} /></svg>;
}

export function TreeNode({ type, label, index, preview, expanded, expandable, language, onToggle }: {
  type: string; label: string; index: boolean; preview: string; expanded: boolean; expandable: boolean;
  language: 'zh' | 'en'; onToggle: () => void;
}) {
  const Icon = icons[type];
  const zh = language === 'zh';
  return <>
    {expandable ? <button className="node-toggle" aria-label={`${expanded ? (zh ? '折叠' : 'Collapse') : (zh ? '展开' : 'Expand')} ${label}`} onClick={onToggle}>{expanded ? <Minus size={11} aria-hidden="true" /> : <Plus size={11} aria-hidden="true" />}</button> : <span className="node-toggle-space" aria-hidden="true" />}
    {Icon && <Icon className={`node-icon type-${type}`} size={14} aria-hidden="true" />}
    <span className={`node-key${index ? ' node-index' : ''}`}>{index ? `[${label}]` : label}</span>
    <span className="node-colon" aria-hidden="true">:</span>
    <span className={`node-value type-${type}`}>{preview}</span>
    <span className="node-type">{type.charAt(0).toUpperCase() + type.slice(1)}</span>
  </>;
}
