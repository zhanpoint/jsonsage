import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

const MIN_HEIGHT = 300;
export default function EditorViewport({ children, language }: { children: ReactNode; language: 'zh' | 'en' }) {
  const [height, setHeight] = useState(420);
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const finish = () => { drag.current = null; delete document.documentElement.dataset.editorResizing; };
  useEffect(() => finish, []);
  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { y: event.clientY, height: host.current!.getBoundingClientRect().height };
    document.documentElement.dataset.editorResizing = '';
  }
  return <div ref={host} className="editor-viewport" style={{ height }}>
    {children}
    <div className="editor-resize-handle" role="separator" aria-orientation="horizontal" aria-label={language === 'zh' ? '调整编辑区高度' : 'Resize editor height'} aria-valuemin={MIN_HEIGHT} aria-valuenow={height} aria-valuetext={`${height}px`} tabIndex={0}
      onPointerDown={start} onPointerMove={event => { if (drag.current) setHeight(Math.max(MIN_HEIGHT, drag.current.height + event.clientY - drag.current.y)); }}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
      onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); setHeight(previous => Math.max(MIN_HEIGHT, previous + (event.key === 'ArrowUp' ? -20 : 20))); } }} />
  </div>;
}
