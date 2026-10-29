import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import DOMPurify from 'dompurify';
import { fetchPreview, previewHref } from '../lib/resourcePreview';
import PreviewLoading from './PreviewLoading';

export default function SlidesPreview({ url, language, controls, onError }: { url: string; language: 'zh' | 'en'; controls: HTMLDivElement | null; onError: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const request = useRef<(page: number, bytes?: ArrayBuffer) => void>(() => {});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const zh = language === 'zh';
  useEffect(() => {
    const controller = new AbortController();
    const parser = new Worker(new URL('../workers/slidesPreview.worker.ts', import.meta.url), { type: 'module' });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const fail = () => { clearTimeout(timeout); parser.terminate(); if (!controller.signal.aborted) onError(); };
    parser.onerror = fail;
    request.current = (next, bytes) => {
      setLoading(true);
      clearTimeout(timeout);
      timeout = setTimeout(fail, 30_000);
      parser.postMessage({ bytes, page: next }, bytes ? [bytes] : []);
    };
    parser.onmessage = ({ data }: MessageEvent<{ page: number; total: number; svg: string; error?: boolean }>) => {
      clearTimeout(timeout);
      if (controller.signal.aborted) return;
      if (data.error) { fail(); return; }
      const fragment = DOMPurify.sanitize(data.svg, { USE_PROFILES: { svg: true, svgFilters: true }, RETURN_DOM_FRAGMENT: true });
      for (const link of fragment.querySelectorAll('a')) {
        const target = Number(link.getAttribute('data-slide'));
        const internal = Number.isInteger(target) && target >= 1 && target <= data.total;
        const value = link.getAttribute('href') ?? link.getAttribute('xlink:href');
        const href = internal ? `#slide-${target}` : value ? previewHref(value, url) : null;
        link.removeAttribute('xlink:href');
        if (!internal) link.removeAttribute('data-slide');
        if (href) {
          link.setAttribute('href', href);
          if (!internal) { link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener noreferrer'); }
        }
        else link.removeAttribute('href');
      }
      host.current?.replaceChildren(fragment);
      setPage(data.page); setTotal(data.total); setLoading(false);
    };
    void fetchPreview(url, controller.signal).then(bytes => {
      if (controller.signal.aborted) return;
      request.current(1, bytes);
    }).catch(fail);
    return () => { controller.abort(); clearTimeout(timeout); parser.terminate(); request.current = () => {}; };
  }, [url, onError]);
  return <div className="slides-preview" aria-busy={loading}>
    {controls && total > 0 && createPortal(<div className="pdf-navigation">
      {total > 1 && <button className="tool-button" aria-label={zh ? '上一页' : 'Previous page'} disabled={page === 1 || loading} onClick={() => request.current(page - 1)}><ChevronLeft size={16} /></button>}
      <span>{page} / {total}</span>
      {total > 1 && <button className="tool-button" aria-label={zh ? '下一页' : 'Next page'} disabled={page === total || loading} onClick={() => request.current(page + 1)}><ChevronRight size={16} /></button>}
    </div>, controls)}
    <div className="slides-page" ref={host} onClick={event => {
      const link = (event.target as Element).closest('a[data-slide]');
      if (link) { event.preventDefault(); request.current(Number(link.getAttribute('data-slide'))); }
    }} />
    {loading && <PreviewLoading language={language} />}
  </div>;
}
