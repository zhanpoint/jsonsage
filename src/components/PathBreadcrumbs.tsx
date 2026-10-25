import { useEffect, useRef } from 'react';
import { Box, Brackets, ChevronRight, Copy, Hash, Quote, ToggleRight } from 'lucide-react';
import { findNodeAtLocation, type Node } from 'jsonc-parser';
import { pathText, type JsonPath } from '../lib/json/views';

export default function PathBreadcrumbs({ path, root, language, onCopy }: {
  path: JsonPath; root?: Node | null; language: 'zh' | 'en'; onCopy: () => void;
}) {
  const segments = useRef<HTMLDivElement>(null);
  useEffect(() => { const element = segments.current; if (element) element.scrollLeft = element.scrollWidth; }, [path]);
  return <nav className="path-breadcrumbs" aria-label={language === 'zh' ? '当前路径' : 'Current path'} title={pathText(path)}>
    <div className="path-segments" ref={segments}>{['root', ...path].map((part, index) => {
      const node = root ? findNodeAtLocation(root, path.slice(0, index)) : undefined;
      const Icon = node?.type === 'array' ? Brackets : node?.type === 'string' ? Quote : node?.type === 'number' ? Hash : node?.type === 'boolean' ? ToggleRight : Box;
      return <span className="path-segment" key={index} aria-current={index === path.length ? 'location' : undefined}>
        {index > 0 && <ChevronRight className="path-divider" size={13} aria-hidden="true" />}<Icon size={13} aria-hidden="true" /><span>{String(part)}</span>
      </span>;
    })}</div>
    <button className="tool-button" aria-label={language === 'zh' ? '复制当前路径' : 'Copy current path'} onClick={onCopy}><Copy size={12} /></button>
  </nav>;
}
