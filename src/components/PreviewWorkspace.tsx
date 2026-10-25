import { useEffect, useRef, useState, type ReactNode } from 'react';

export default function PreviewWorkspace({ children, preview, language }: { children: ReactNode; preview: ReactNode; language: 'zh' | 'en' }) {
  const host = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [ratio, setRatio] = useState(50);
  const clamp = (value: number) => Math.max(20, Math.min(80, value));
  const finish = () => { dragging.current = false; delete document.documentElement.dataset.previewResizing; };
  useEffect(() => finish, []);
  useEffect(() => { if (!preview) finish(); }, [preview]);
  return <div ref={host} className="preview-workspace" style={preview ? { gridTemplateColumns: `minmax(0, ${ratio}fr) 1px minmax(0, ${100 - ratio}fr)` } : undefined}>
    <div className="editor-content">{children}</div>
    {preview && <><div className="preview-divider" role="separator" aria-orientation="vertical" aria-label={language === 'zh' ? '调整预览宽度' : 'Resize preview'} aria-valuemin={20} aria-valuemax={80} aria-valuenow={ratio} tabIndex={0}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); dragging.current = true; document.documentElement.dataset.previewResizing = ''; }}
      onPointerMove={event => { if (dragging.current && host.current) { const box = host.current.getBoundingClientRect(); setRatio(clamp((event.clientX - box.left) / box.width * 100)); } }}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setRatio(value => clamp(value + (event.key === 'ArrowLeft' ? -2 : 2))); } }} />{preview}</>}
  </div>;
}
