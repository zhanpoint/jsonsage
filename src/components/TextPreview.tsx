import { Component, lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ExternalLink, X } from 'lucide-react';
import PreviewEmpty from './PreviewEmpty';
import { type JsonPath } from '../lib/json/views';
import { previewResource } from '../lib/resourcePreview';
import ResourcePreview from './ResourcePreview';
import PreviewLoading from './PreviewLoading';
import './textPreview.css';
import 'katex/dist/katex.min.css';
import type { InspectorClient } from '../lib/inspectorClient';

const MarkdownText = lazy(() => import('./MarkdownText'));
// Bound synchronous Markdown parsing and DOM size, independently of JSON document size.
const TEXT_PREVIEW_LIMIT = 50_000;
class RenderBoundary extends Component<{ children: ReactNode; fallback: ReactNode; resetKey: string }, { failed: boolean; resetKey: string }> {
  state = { failed: false, resetKey: this.props.resetKey };
  static getDerivedStateFromProps({ resetKey }: { resetKey: string }, state: { resetKey: string }) {
    return resetKey !== state.resetKey ? { failed: false, resetKey } : null;
  }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function TextPreview({ source, path, inspector, language, onClose }: {
  source: string; path: JsonPath; inspector: InspectorClient; language: 'zh' | 'en'; onClose: () => void;
}) {
  const zh = language === 'zh';
  const pathKey = JSON.stringify(path);
  const [snapshot, setSnapshot] = useState<{ pathKey: string; text: string | null; length?: number; error?: boolean } | null>(null);
  const result = snapshot?.pathKey === pathKey ? snapshot : null;
  const panel = useRef<HTMLElement>(null);
  const [controls, setControls] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    let current = true;
    void inspector.query({ kind: 'preview', path: JSON.parse(pathKey) }).then(value => {
      if (current) setSnapshot({ ...value, pathKey });
    }).catch(error => { if (current && error.name !== 'AbortError') setSnapshot({ pathKey, text: null, error: true }); });
    return () => { current = false; inspector.cancel('preview'); };
  }, [source, pathKey, inspector]);
  useLayoutEffect(() => {
    const origin = document.activeElement as HTMLElement | null;
    const element = panel.current;
    element?.focus({ preventScroll: true });
    return () => { if (element?.contains(document.activeElement) && origin?.isConnected) origin.focus({ preventScroll: true }); };
  }, []);
  const text = result?.text;
  const resource = typeof text === 'string' ? previewResource(text) : null;
  const shown = text?.slice(0, TEXT_PREVIEW_LIMIT) ?? '';
  const truncated = (result?.length ?? text?.length ?? 0) > TEXT_PREVIEW_LIMIT;
  return <aside ref={panel} tabIndex={-1} className="text-preview" aria-label={zh ? '预览' : 'Preview'} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>
    <header className="preview-toolbar">
      <div ref={setControls} className="preview-controls" />
      {resource && <a className="tool-button" href={resource.url} target="_blank" rel="noopener noreferrer" aria-label={zh ? '在新标签页打开' : 'Open in new tab'} title={zh ? '在新标签页打开' : 'Open in new tab'}><ExternalLink size={14} /></a>}
      <button className="tool-button" aria-label={zh ? '关闭预览' : 'Close preview'} title={zh ? '关闭预览' : 'Close preview'} onClick={onClose}><X size={14} /></button>
    </header>
    {resource ? <RenderBoundary key={resource.url} resetKey={resource.url} fallback={<div className="resource-empty"><p>{zh ? '无法加载预览。' : 'Preview could not load.'}</p></div>}><ResourcePreview resource={resource} language={language} controls={controls} /></RenderBoundary> : typeof text === 'string' ? <>
      {truncated && <p className="text-preview-note">{zh ? '仅预览前 50,000 个字符。' : 'Showing the first 50,000 characters.'}</p>}
      <div className="text-preview-body" >
        <RenderBoundary resetKey={shown} fallback={<><p role="alert">{zh ? '渲染失败，已显示原文。' : 'Rendering failed. Showing source.'}</p><pre className="text-preview-source">{shown}</pre></>}>
          <Suspense fallback={<PreviewLoading language={language} message={zh ? '正在排版…' : 'Rendering…'} />}><MarkdownText text={shown} language={language} /></Suspense>
        </RenderBoundary>
      </div>
    </> : result && !result.error ? <div className="text-preview-body"><PreviewEmpty language={language} /></div>
      : <div className="text-preview-body">{!result ? <PreviewLoading language={language} message={zh ? '正在读取文本…' : 'Reading text…'} /> : <p className="text-preview-note" role="status">{zh ? '无法读取此字段，请重新选择。' : 'Unable to read this field. Select it again.'}</p>}</div>}
  </aside>;
}
