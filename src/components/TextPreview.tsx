import { Component, lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import PreviewEmpty from './PreviewEmpty';
import { type JsonPath } from '../lib/json/views';
import { previewResource } from '../lib/resourcePreview';
import ResourcePreview from './ResourcePreview';
import './textPreview.css';
import 'katex/dist/katex.min.css';

const MarkdownText = lazy(() => import('./MarkdownText'));
// Bound synchronous Markdown parsing and DOM size, independently of JSON document size.
const TEXT_PREVIEW_LIMIT = 50_000;
class RenderBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function TextPreview({ source, path, language, onClose }: {
  source: string; path: JsonPath; language: 'zh' | 'en'; onClose: () => void;
}) {
  const zh = language === 'zh';
  const [result, setResult] = useState<{ text: string | null; error?: boolean } | null>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    setResult(null);
    const worker = new Worker(new URL('../workers/textPreview.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = event => { setResult(event.data); worker.terminate(); };
    worker.onerror = () => { setResult({ text: null, error: true }); worker.terminate(); };
    worker.postMessage({ source, path });
    return () => worker.terminate();
  }, [source, path]);
  useLayoutEffect(() => {
    const origin = document.activeElement as HTMLElement | null;
    const element = panel.current;
    element?.focus({ preventScroll: true });
    return () => { if (element?.contains(document.activeElement) && origin?.isConnected) origin.focus({ preventScroll: true }); };
  }, []);
  const text = result?.text;
  const resource = typeof text === 'string' ? previewResource(text) : null;
  const shown = text?.slice(0, TEXT_PREVIEW_LIMIT) ?? '';
  const truncated = text !== null && text !== undefined && text.length > TEXT_PREVIEW_LIMIT;
  return <aside ref={panel} tabIndex={-1} className="text-preview" aria-label={zh ? '预览' : 'Preview'} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>
    <button className="tool-button text-preview-close" aria-label={zh ? '关闭预览' : 'Close preview'} title={zh ? '关闭预览' : 'Close preview'} onClick={onClose}><X size={14} /></button>
    {resource ? <RenderBoundary key={resource.url} fallback={<div className="resource-empty"><p>{zh ? '无法加载预览。' : 'Preview could not load.'}</p><a className="resource-open" href={resource.url} target="_blank" rel="noopener noreferrer">{zh ? '在新标签页打开' : 'Open in new tab'}</a></div>}><ResourcePreview resource={resource} language={language} /></RenderBoundary> : typeof text === 'string' ? <>
      {truncated && <p className="text-preview-note">{zh ? '仅预览前 50,000 个字符。' : 'Showing the first 50,000 characters.'}</p>}
      <div className="text-preview-body" >
        <RenderBoundary fallback={<><p role="alert">{zh ? '渲染失败，已显示原文。' : 'Rendering failed. Showing source.'}</p><pre className="text-preview-source">{shown}</pre></>}>
          <Suspense fallback={<p role="status">{zh ? '正在排版…' : 'Rendering…'}</p>}><MarkdownText text={shown} language={language} /></Suspense>
        </RenderBoundary>
      </div>
    </> : result && !result.error ? <div className="text-preview-body"><PreviewEmpty language={language} /></div>
      : <p className="text-preview-note" role="status">{!result ? (zh ? '正在读取文本…' : 'Reading text…') : (zh ? '无法读取此字段，请重新选择。' : 'Unable to read this field. Select it again.')}</p>}
  </aside>;
}
