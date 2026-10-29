import { useEffect, useRef } from 'react';
import { Box, Brackets, ChevronLeft, ChevronRight, Copy, Hash, Quote, ToggleRight } from 'lucide-react';
import { findNodeAtLocation, type Node } from 'jsonc-parser';
import { pathText, type JsonPath } from '../lib/json/views';
import './pathBreadcrumbs.css';

export default function PathBreadcrumbs({ path, root, language, onCopy, onNavigate }: {
  path: JsonPath; root?: Node | null; language: 'zh' | 'en'; onCopy: () => void;
  onNavigate: (path: JsonPath, direction?: -1 | 1) => void;
}) {
  const segments = useRef<HTMLDivElement>(null);
  const arrayIndex = path.reduce<number>((last, part, index) => typeof part === 'number' ? index : last, -1);
  const array = root && arrayIndex >= 0 ? findNodeAtLocation(root, path.slice(0, arrayIndex)) : undefined;
  useEffect(() => { const element = segments.current; if (element) element.scrollLeft = element.scrollWidth; }, [path]);
  return <nav className="path-breadcrumbs" aria-label={language === 'zh' ? '当前路径' : 'Current path'} title={pathText(path)}>
    <div className="path-segments" ref={segments}>{['root', ...path].map((part, index) => {
      const node = root ? findNodeAtLocation(root, path.slice(0, index)) : undefined;
      const Icon = node?.type === 'array' ? Brackets : node?.type === 'string' ? Quote : node?.type === 'number' ? Hash : node?.type === 'boolean' ? ToggleRight : Box;
      return <span className="path-segment" key={index} aria-current={index === path.length ? 'location' : undefined}>
        {index > 0 && <ChevronRight className="path-divider" size={13} aria-hidden="true" />}<button onClick={() => onNavigate(path.slice(0, index))} title={pathText(path.slice(0, index))}><Icon size={13} aria-hidden="true" /><span>{String(part)}</span></button>
      </span>;
    })}</div>
    {arrayIndex >= 0 && <>
      <button className="tool-button" disabled={path[arrayIndex] === 0} aria-label={language === 'zh' ? '上一个数组元素' : 'Previous array item'} title={language === 'zh' ? '上一个数组元素（保留字段路径）' : 'Previous item, same field'} onClick={() => onNavigate(path, -1)}><ChevronLeft size={12} /></button>
      <button className="tool-button" disabled={!!array && Number(path[arrayIndex]) >= (array.children?.length ?? 0) - 1} aria-label={language === 'zh' ? '下一个数组元素' : 'Next array item'} title={language === 'zh' ? '下一个数组元素（保留字段路径）' : 'Next item, same field'} onClick={() => onNavigate(path, 1)}><ChevronRight size={12} /></button>
    </>}
    <button className="tool-button" aria-label={language === 'zh' ? '复制当前路径' : 'Copy current path'} onClick={onCopy}><Copy size={12} /></button>
  </nav>;
}
