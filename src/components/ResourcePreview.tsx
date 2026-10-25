import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { ExternalLink, FileSearch } from 'lucide-react';
import { fetchPreview, type PreviewResource } from '../lib/resourcePreview';

const MarkdownText = lazy(() => import('./MarkdownText'));
const OfficePreview = lazy(() => import('./OfficePreview'));
const PdfPreview = lazy(() => import('./PdfPreview'));

export default function ResourcePreview({ resource, language }: { resource: PreviewResource; language: 'zh' | 'en' }) {
  const zh = language === 'zh';
  const [failed, setFailed] = useState(false);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const onError = useCallback(() => setFailed(true), []);
  useEffect(() => {
    if (resource.kind !== 'markdown' && resource.kind !== 'pdf') return;
    const controller = new AbortController();
    void fetchPreview(resource.url, controller.signal).then(bytes => {
      if (controller.signal.aborted) return;
      if (resource.kind === 'pdf') {
        if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes('%PDF-')) throw new Error('INVALID_PDF');
        setPdfBytes(bytes);
      } else setMarkdown(new TextDecoder().decode(bytes));
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [resource.url, resource.kind]);
  const open = <a href={resource.url} target="_blank" rel="noopener noreferrer" className="resource-open"><ExternalLink size={14} />{zh ? '在新标签页打开' : 'Open in new tab'}</a>;
  const unsupported = resource.kind === 'document' && !resource.name.toLowerCase().endsWith('.docx');
  if (failed || unsupported || resource.kind === 'website') return <div className="resource-empty">
    <FileSearch size={28} strokeWidth={1.4} /><span>{resource.name}</span>
    {failed && <p>{zh ? '无法加载预览，请打开原文件。' : 'Preview could not load. Open the original file.'}</p>}{open}
    {unsupported && <p>{zh ? '此格式暂时无法在浏览器内预览。' : 'This format cannot be previewed in the browser yet.'}</p>}
  </div>;
  return <div className={`resource-preview resource-${resource.kind}`}>
    <div className="resource-actions">{open}</div>
    {resource.kind === 'image' && <img src={resource.url} alt={resource.name} referrerPolicy="no-referrer" decoding="async" onError={() => setFailed(true)} />}
    {resource.kind === 'audio' && <audio src={resource.url} controls preload="metadata" onError={() => setFailed(true)} />}
    {resource.kind === 'video' && <video src={resource.url} controls playsInline preload="metadata" onError={() => setFailed(true)} />}
    {resource.kind === 'pdf' && <Suspense fallback={<p className="text-preview-note" role="status">{zh ? '正在加载…' : 'Loading…'}</p>}>{pdfBytes ? <PdfPreview bytes={pdfBytes} language={language} onError={onError} /> : <p className="text-preview-note" role="status">{zh ? '正在加载…' : 'Loading…'}</p>}</Suspense>}
    {resource.kind === 'markdown' && <div className="text-preview-body">{markdown === null ? <p role="status">{zh ? '正在加载…' : 'Loading…'}</p> : <Suspense fallback={null}>{markdown.length > 50_000 && <p className="text-preview-note">{zh ? '仅预览前 50,000 个字符。' : 'Showing the first 50,000 characters.'}</p>}<MarkdownText text={markdown.slice(0, 50_000)} language={language} sourceUrl={resource.url} /></Suspense>}</div>}
    {(resource.kind === 'sheet' || resource.kind === 'document') && <Suspense fallback={<p className="text-preview-note" role="status">{zh ? '正在加载…' : 'Loading…'}</p>}><OfficePreview resource={resource} language={language} onError={onError} /></Suspense>}
  </div>;
}
