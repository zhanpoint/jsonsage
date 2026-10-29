import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Keep the primary pane mounted when the secondary pane is toggled. */
export default function ResizableColumns({ children, secondary, label, className, hidden }: {
  children: ReactNode; secondary?: ReactNode; label: string; className?: string; hidden?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [ratio, setRatio] = useState(50);
  const enabled = !!secondary && !hidden;
  const clamp = (value: number) => Math.max(20, Math.min(80, value));
  const finish = () => {
    if (!dragging.current) return;
    dragging.current = false;
    delete document.documentElement.dataset.columnsResizing;
  };
  useEffect(() => finish, []);
  useEffect(() => { if (!enabled) finish(); }, [enabled]);
  return <div ref={host} hidden={hidden} className={className}
    style={secondary ? { display: hidden ? 'none' : 'grid', gridTemplateColumns: `minmax(0, ${ratio}fr) 1px minmax(0, ${100 - ratio}fr)`, gridTemplateRows: 'minmax(0, 1fr)' } : undefined}>
    {children}
    {secondary && <><div className="columns-divider" role="separator" aria-orientation="vertical" aria-label={label} aria-valuemin={20} aria-valuemax={80} aria-valuenow={ratio} tabIndex={0}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); dragging.current = true; document.documentElement.dataset.columnsResizing = ''; }}
      onPointerMove={event => { if (dragging.current && host.current) { const box = host.current.getBoundingClientRect(); setRatio(clamp((event.clientX - box.left) / box.width * 100)); } }}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setRatio(value => clamp(value + (event.key === 'ArrowLeft' ? -2 : 2))); } }} />{secondary}</>}
  </div>;
}
