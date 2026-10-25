import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, version, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfPreview({ bytes, language, onError }: { bytes: ArrayBuffer; language: 'zh' | 'en'; onError: () => void }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    // PDF.js transfers the buffer; retain the React input for strict-mode remounts.
    const assets = `${import.meta.env.BASE_URL}assets/pdf-preview/${version}/`;
    const task = getDocument({ data: bytes.slice(0), cMapUrl: `${assets}cmaps/`, standardFontDataUrl: `${assets}standard_fonts/`, wasmUrl: `${assets}wasm/`, iccUrl: `${assets}iccs/` });
    task.onPassword = () => { if (active) onError(); };
    void task.promise.then(value => { if (active) setPdf(value); }).catch(() => { if (active) onError(); });
    return () => { active = false; void task.destroy(); };
  }, [bytes, onError]);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf || !width || !canvas.current) return;
    let active = true;
    let render: RenderTask | undefined;
    const target = canvas.current;
    setLoading(true);
    void pdf.getPage(page).then(async value => {
      if (!active) return;
      const original = value.getViewport({ scale: 1 });
      // Bound bitmap allocation on high-DPI displays and unusually tall pages.
      const scale = Math.min(width / original.width * Math.min(devicePixelRatio, 2), Math.sqrt(4_000_000 / (original.width * original.height)));
      const viewport = value.getViewport({ scale });
      target.width = Math.ceil(viewport.width);
      target.height = Math.ceil(viewport.height);
      render = value.render({ canvas: target, viewport });
      await render.promise;
      if (active) { setLoading(false); value.cleanup(); }
    }).catch(error => { if (active && error?.name !== 'RenderingCancelledException') onError(); });
    return () => { active = false; render?.cancel(); };
  }, [pdf, page, width, onError]);
  const zh = language === 'zh';
  return <div className="pdf-preview">
    <div className="pdf-navigation">
      <button className="tool-button" aria-label={zh ? '上一页' : 'Previous page'} disabled={!pdf || page === 1} onClick={() => setPage(n => n - 1)}><ChevronLeft size={16} /></button>
      <span>{pdf ? `${page} / ${pdf.numPages}` : '…'}</span>
      <button className="tool-button" aria-label={zh ? '下一页' : 'Next page'} disabled={!pdf || page === pdf.numPages} onClick={() => setPage(n => n + 1)}><ChevronRight size={16} /></button>
    </div>
    <div className="pdf-page-scroll"><div ref={host} className="pdf-page">
      {loading && <p role="status">{zh ? '正在加载…' : 'Loading…'}</p>}
      <canvas ref={canvas} aria-label={zh ? `第 ${page} 页` : `Page ${page}`} style={{ visibility: loading ? 'hidden' : 'visible' }} />
    </div></div>
  </div>;
}
