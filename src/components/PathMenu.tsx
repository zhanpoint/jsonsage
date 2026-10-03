import { useEffect, useLayoutEffect, useRef } from 'react';
import { Copy } from 'lucide-react';
import { formatPath, pathFormats } from '../lib/paths';
import { pathText, type JsonPath } from '../lib/json/views';

export type PathMenuTarget = { x: number; y: number; path: JsonPath };

export function PathMenu({ target, language, onClose, onCopy }: {
  target: PathMenuTarget; language: 'zh' | 'en'; onClose: () => void; onCopy: (path: string) => Promise<void>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const origin = useRef(document.activeElement as HTMLElement | null);
  useLayoutEffect(() => {
    const menu = ref.current!;
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(target.x, window.innerWidth - width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(target.y, window.innerHeight - height - 8))}px`;
    menu.querySelector('button')?.focus({ preventScroll: true });
  }, [target]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') { onClose(); if (event.key === 'Escape') origin.current?.focus({ preventScroll: true }); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus({ preventScroll: true });
    };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', keyboard);
    window.addEventListener('resize', onClose);
    document.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', keyboard);
      window.removeEventListener('resize', onClose);
      document.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);
  return <div ref={ref} className="path-menu" role="menu" aria-label="JSONPath" onContextMenu={event => event.preventDefault()}>
    <code title={pathText(target.path)}>{pathText(target.path)}</code>
    {pathFormats.map(format => <button key={format} role="menuitem" onClick={() => { void onCopy(formatPath(target.path, format)); onClose(); }}><Copy size={14} />{language === 'zh' ? '复制' : 'Copy'} {{ jsonpath: 'JSONPath', javascript: 'JavaScript', jq: 'JQ', pointer: 'JSON Pointer' }[format]}</button>)}
  </div>;
}
