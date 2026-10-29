import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { FileSearch } from 'lucide-react';
import { fetchPreview, resolvePreviewResource, type PreviewResource } from '../lib/resourcePreview';
import PreviewLoading from './PreviewLoading';

const MarkdownText = lazy(() => import('./MarkdownText'));
const OfficePreview = lazy(() => import('./OfficePreview'));
const PdfPreview = lazy(() => import('./PdfPreview'));
const SlidesPreview = lazy(() => import('./SlidesPreview'));
const MediaPreview = lazy(() => import('./MediaPreview'));

export default function ResourcePreview({ resource, language, controls }: { resource: PreviewResource; language: 'zh' | 'en'; controls: HTMLDivElement | null }) {
  const [resolved, setResolved] = useState<PreviewResource | null>(resource.kind === 'unknown' ? null : resource);
  useEffect(() => {
    if (resource.kind !== 'unknown') return;
    const controller = new AbortController();
    void resolvePreviewResource(resource, controller.signal).then(value => { if (!controller.signal.aborted) setResolved(value); }).catch(() => {
      // Native images remain usable when the optional metadata transport is unavailable.
      if (!controller.signal.aborted) setResolved(resource);
    });
    return () => controller.abort();
  }, [resource.url, resource.kind]);
  return resolved ? <ResolvedPreview resource={resolved} language={language} controls={controls} /> : <PreviewLoading language={language} />;
}

function ResolvedPreview({ resource, language, controls }: { resource: PreviewResource; language: 'zh' | 'en'; controls: HTMLDivElement | null }) {
  const zh = language === 'zh';
  const [failed, setFailed] = useState(false);
  const [pdfError, setPdfError] = useState<'fetch' | 'render' | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const onError = useCallback(() => setFailed(true), []);
  const onPdfError = useCallback((reason: 'fetch' | 'render') => { setPdfError(reason); setFailed(true); }, []);
  useEffect(() => {
    if (resource.kind !== 'markdown') return;
    const controller = new AbortController();
    void fetchPreview(resource.url, controller.signal).then(bytes => {
      if (controller.signal.aborted) return;
      setMarkdown(new TextDecoder().decode(bytes));
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [resource.url, resource.kind]);
  const loading = <PreviewLoading language={language} />;
  const unsupported = resource.kind === 'document' && !resource.name.toLowerCase().endsWith('.docx');
  // Let the browser decode extensionless image URLs without requiring a CORS-enabled fetch.
  const image = resource.kind === 'image' || resource.kind === 'unknown';
  if (failed || unsupported || resource.kind === 'website') return <div className="resource-empty">
    <FileSearch size={28} strokeWidth={1.4} /><span>{resource.name}</span>
    {failed && resource.kind !== 'unknown' && <p>{pdfError === 'fetch'
      ? (zh ? '无法获取远程 PDF，请检查网络、文件地址或预览代理服务。' : 'Could not fetch the remote PDF. Check the connection, file URL or preview proxy service.')
      : pdfError === 'render'
        ? (zh ? 'PDF 无法解析或需要密码，请打开原文件。' : 'The PDF could not be rendered or requires a password. Open the original file.')
        : (zh ? '无法加载预览，请打开原文件。' : 'Preview could not load. Open the original file.')}</p>}
    {unsupported && <p>{zh ? '此格式暂时无法在浏览器内预览。' : 'This format cannot be previewed in the browser yet.'}</p>}
  </div>;
  return <div className={`resource-preview resource-${image ? 'image' : resource.kind}`}>
    {image && <figure className="resource-image-content">
      {!imageLoaded && loading}
      <img src={resource.url} alt={resource.name} referrerPolicy="no-referrer" decoding="async" hidden={!imageLoaded} onLoad={() => setImageLoaded(true)} onError={onError} />
    </figure>}
    {(resource.kind === 'audio' || resource.kind === 'video') && <Suspense fallback={loading}><MediaPreview url={resource.url} kind={resource.kind} language={language} /></Suspense>}
    {resource.kind === 'pdf' && <Suspense fallback={loading}><PdfPreview url={resource.url} language={language} controls={controls} onError={onPdfError} /></Suspense>}
    {resource.kind === 'presentation' && <Suspense fallback={loading}><SlidesPreview url={resource.url} language={language} controls={controls} onError={onError} /></Suspense>}
    {resource.kind === 'markdown' && <div className="text-preview-body">{markdown === null ? loading : <Suspense fallback={loading}>{markdown.length > 50_000 && <p className="text-preview-note">{zh ? '仅预览前 50,000 个字符。' : 'Showing the first 50,000 characters.'}</p>}<MarkdownText text={markdown.slice(0, 50_000)} language={language} sourceUrl={resource.url} /></Suspense>}</div>}
    {(resource.kind === 'sheet' || resource.kind === 'document') && <Suspense fallback={loading}><OfficePreview resource={resource} language={language} onError={onError} /></Suspense>}
  </div>;
}
