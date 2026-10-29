import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, version, type PDFDocumentProxy, type PDFDocumentLoadingTask, type PDFPageProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { fetchPreview, previewHref } from '../lib/resourcePreview';
import { usePreviewAppearance } from '../hooks/usePreviewAppearance';
import { pageInkBounds, type PageBounds } from '../lib/pdfPreview';
import PreviewLoading from './PreviewLoading';

GlobalWorkerOptions.workerSrc = workerUrl;

type Link = { id: string; href: string | null; dest?: string | unknown[]; left: number; top: number; width: number; height: number };

export default function PdfPreview({ url, language, controls, onError }: { url: string; language: 'zh' | 'en'; controls: HTMLDivElement | null; onError: (reason: 'fetch' | 'render') => void }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState<Link[]>([]);
  const host = useRef<HTMLDivElement>(null);
  const viewportHost = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const measured = useRef<{ page: PDFPageProxy; bounds: PageBounds } | null>(null);
  const appearance = usePreviewAppearance(host);
  const filterId = useId();
  // Keep dark ink legible while bringing light fills close to the theme surface.
  const opacity = appearance.dark ? '1 1 1 0.98 0.92 0.75 0.35 0.1 0.02 0 0' : '1 0';
  useEffect(() => {
    const controller = new AbortController();
    let task: PDFDocumentLoadingTask | undefined;
    const assets = `${import.meta.env.BASE_URL}assets/pdf-preview/${version}/`;
    void fetchPreview(url, controller.signal).then(async bytes => {
      if (controller.signal.aborted) return;
      // Transfer ownership straight to PDF.js; no retained React buffer or clone.
      task = getDocument({ data: new Uint8Array(bytes), docBaseUrl: url, cMapUrl: `${assets}cmaps/`, standardFontDataUrl: `${assets}standard_fonts/`,
        wasmUrl: `${assets}wasm/`, iccUrl: `${assets}iccs/`, canvasMaxAreaInBytes: 16_000_000 });
      task.onPassword = () => { if (!controller.signal.aborted) { onError('render'); void task?.destroy(); } };
      const value = await task.promise;
      if (!controller.signal.aborted) { setPdf(value); setPage(1); }
    }).catch(() => { if (!controller.signal.aborted) onError(task ? 'render' : 'fetch'); });
    return () => { controller.abort(); void task?.destroy(); };
  }, [url, onError]);
  useEffect(() => {
    const element = viewportHost.current;
    const target = canvas.current;
    if (!element) return;
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setViewportSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) }));
    });
    observer.observe(element);
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      void Promise.resolve(renderTask.current?.promise).catch(() => {}).then(() => {
        if (target) { target.width = 0; target.height = 0; }
      });
    };
  }, []);
  useEffect(() => {
    if (!pdf || !viewportSize.width || !viewportSize.height || !canvas.current) return;
    let active = true;
    let render: RenderTask | undefined;
    const previous = renderTask.current;
    const target = canvas.current;
    setLoading(true);
    setLinks([]);
    void (async () => {
      // A canceled render must finish before the same canvas can be reused.
      await previous?.promise.catch(() => {});
      if (!active) return;
      const value = await pdf.getPage(page);
      if (!active) return;
      try {
        const original = value.getViewport({ scale: 1 });
        const annotations = (await value.getAnnotations({ intent: 'display' })).filter(annotation => annotation.subtype === 'Link' &&
          (annotation.dest || (annotation.url && previewHref(annotation.url, url))));
        if (!active) return;
        if (measured.current?.page !== value) {
          // Measure once at bounded resolution, reusing the same hidden canvas.
          // Text-only bounds would lose tables, drawings and scanned pages.
          const probeScale = Math.min(1, 1024 / Math.max(original.width, original.height));
          const probe = value.getViewport({ scale: probeScale });
          target.width = Math.ceil(probe.width); target.height = Math.ceil(probe.height);
          render = value.render({ canvas: target, viewport: probe, background: '#fff' });
          renderTask.current = render;
          await render.promise;
          if (!active) return;
          const ink = pageInkBounds(target.getContext('2d')!.getImageData(0, 0, target.width, target.height));
          const bounds = ink ? { left: ink.left / probeScale, top: ink.top / probeScale, right: ink.right / probeScale, bottom: ink.bottom / probeScale }
            : { left: 0, top: 0, right: original.width, bottom: original.height };
          // Invisible link hit areas are content too; keep them inside the crop.
          for (const annotation of annotations) {
            const [x1, y1] = original.convertToViewportPoint(annotation.rect[0], annotation.rect[1]);
            const [x2, y2] = original.convertToViewportPoint(annotation.rect[2], annotation.rect[3]);
            bounds.left = Math.min(bounds.left, x1, x2); bounds.top = Math.min(bounds.top, y1, y2);
            bounds.right = Math.max(bounds.right, x1, x2); bounds.bottom = Math.max(bounds.bottom, y1, y2);
          }
          const edge = 2 / probeScale;
          measured.current = { page: value, bounds: { left: Math.max(0, bounds.left - edge), top: Math.max(0, bounds.top - edge),
            right: Math.min(original.width, bounds.right + edge), bottom: Math.min(original.height, bounds.bottom + edge) } };
        }
        const bounds = measured.current.bounds;
        const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top;
        const displayScale = Math.min(viewportSize.width / width, viewportSize.height / height);
        setPageSize({ width: width * displayScale, height: height * displayScale });
        const scale = Math.min(displayScale * Math.min(devicePixelRatio, 2), Math.sqrt(4_000_000 / (width * height)));
        const viewport = value.getViewport({ scale, offsetX: -bounds.left * scale, offsetY: -bounds.top * scale });
        target.width = Math.ceil(width * scale); target.height = Math.ceil(height * scale);
        render = value.render({ canvas: target, viewport, background: '#fff' });
        renderTask.current = render;
        await render.promise;
        if (!active) return;
        const next: Link[] = [];
        for (const annotation of annotations) {
          const href = annotation.url ? previewHref(annotation.url, url) : null;
          const [x1, y1] = viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1]);
          const [x2, y2] = viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3]);
          next.push({ id: annotation.id, href, dest: annotation.dest,
            left: Math.min(x1, x2) / (width * scale) * 100, top: Math.min(y1, y2) / (height * scale) * 100,
            width: Math.abs(x2 - x1) / (width * scale) * 100, height: Math.abs(y2 - y1) / (height * scale) * 100 });
        }
        setLinks(next);
        setLoading(false);
      } finally { value.cleanup(); }
    })().catch(error => { if (active && error?.name !== 'RenderingCancelledException') onError('render'); });
    return () => { active = false; render?.cancel(); };
  }, [pdf, page, viewportSize, url, onError]);
  async function navigate(dest: Link['dest']) {
    if (!pdf || !dest) return;
    try {
      const target = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
      const ref = target?.[0];
      const index = typeof ref === 'number' ? ref : ref && typeof ref === 'object' && 'num' in ref && 'gen' in ref
        ? await pdf.getPageIndex({ num: Number(ref.num), gen: Number(ref.gen) }) : -1;
      if (index >= 0 && index < pdf.numPages) setPage(index + 1);
    } catch { /* A broken bookmark should not discard the readable page. */ }
  }
  const zh = language === 'zh';
  return <div className="pdf-preview">
    {loading && <PreviewLoading language={language} />}
    {/* Theme the finished page without parsing, rendering or copying pixels again. */}
    <svg className="pdf-theme" aria-hidden="true" width="0" height="0"><defs><filter id={filterId} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
      {/* White paper becomes transparent: CSS supplies the exact shared surface. */}
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.2126 0.7152 0.0722 0 0" />
      <feComponentTransfer result="inkMask">
        <feFuncA type="table" tableValues={opacity} />
      </feComponentTransfer>
      <feFlood floodColor={appearance.foreground} />
      <feComposite in2="inkMask" operator="in" />
    </filter></defs></svg>
    {controls && createPortal(<div className="pdf-navigation">
      {pdf && pdf.numPages > 1 && <button className="tool-button" aria-label={zh ? '上一页' : 'Previous page'} title={zh ? '上一页' : 'Previous page'} disabled={page === 1} onClick={() => setPage(n => n - 1)}><ChevronLeft size={14} /></button>}
      <span aria-live="polite">{pdf ? `${page} / ${pdf.numPages}` : '…'}</span>
      {pdf && pdf.numPages > 1 && <button className="tool-button" aria-label={zh ? '下一页' : 'Next page'} title={zh ? '下一页' : 'Next page'} disabled={page === pdf.numPages} onClick={() => setPage(n => n + 1)}><ChevronRight size={14} /></button>}
    </div>, controls)}
    <div ref={viewportHost} className="pdf-viewport"><div ref={host} className="pdf-page" aria-busy={loading} style={pageSize.width ? { width: pageSize.width, height: pageSize.height } : undefined}>
      <canvas ref={canvas} aria-label={zh ? `第 ${page} 页` : `Page ${page}`} style={{ visibility: loading ? 'hidden' : 'visible', filter: `url(#${filterId})` }} />
      {!loading && <div className="pdf-links">{links.map(link => <a key={link.id} href={link.href ?? '#'} target={link.href ? '_blank' : undefined} rel="noopener noreferrer"
        aria-label={link.href ?? (zh ? '跳转到文档中的位置' : 'Go to location in document')} title={link.href ?? (zh ? '文档内跳转' : 'Document link')}
        style={{ left: `${link.left}%`, top: `${link.top}%`, width: `${link.width}%`, height: `${link.height}%` }}
        onClick={event => { if (!link.href) { event.preventDefault(); void navigate(link.dest); } }} />)}</div>}
    </div></div>
  </div>;
}
