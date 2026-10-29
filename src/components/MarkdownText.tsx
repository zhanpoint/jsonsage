import { createContext, memo, useContext, useId, useMemo, useState } from 'react';
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { remarkAlert } from 'remark-github-blockquote-alert';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import PreviewEmpty from './PreviewEmpty';

interface PreviewNode {
  type: string;
  tagName?: string;
  children?: PreviewNode[];
  properties?: { className: string[] };
}

// Inspect the sanitized tree so HTML formatting and Markdown share one path.
function rehypePreviewEmpty() {
  const hasFormatting = (node: PreviewNode): boolean => {
    if (node.type === 'root' || node.tagName === 'p') return node.children?.some(hasFormatting) ?? false;
    return node.type === 'element';
  };
  return (tree: PreviewNode) => {
    if (!hasFormatting(tree)) tree.children = [{
      type: 'element', tagName: 'p', children: [], properties: { className: ['preview-empty-marker'] },
    }];
  };
}

const attributes = {
  ...defaultSchema.attributes,
  code: [['className', /^language-./, 'math-inline', 'math-display']],
  div: [...(defaultSchema.attributes?.div ?? []), ['className', /^markdown-alert(?:-(?:note|tip|important|warning|caution))?$/]],
  p: [['className', 'markdown-alert-title']],
};

const ImageLinkContext = createContext(false);

function PreviewImage({ src, alt = '', title, width, height, language }: {
  src?: string; alt?: string; title?: string; width?: string | number; height?: string | number; language: 'zh' | 'en';
}) {
  const linked = useContext(ImageLinkContext);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const valid = !!src && /^https?:\/\//i.test(src);
  const failed = !valid || status === 'error';
  const zh = language === 'zh';
  return <span className="preview-image" data-state={failed ? 'error' : status}>
    {!failed && <img key={attempt} src={src} alt={alt} title={title} width={width} height={height} loading={attempt ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer"
      onLoad={() => setStatus('loaded')} onError={() => setStatus('error')} />}
    {status === 'loading' && !failed && <span className="preview-image-loading" role="status">{zh ? '正在加载图片…' : 'Loading image…'}</span>}
    {failed && <>
      <span className="preview-image-label">{alt || (zh ? '图片' : 'Image')}</span>
      <span className="preview-image-message" role="status">{valid ? (zh ? '图片加载失败，请检查链接或网络。' : 'Image failed to load. Check the link or connection.') : (zh ? '无法解析图片地址，请使用完整图片链接。' : 'Unable to resolve this image. Use a complete image URL.')}</span>
      {valid && !linked && <span className="preview-image-actions">
        <button type="button" onClick={() => { setAttempt(value => value + 1); setStatus('loading'); }}>{zh ? '重新加载' : 'Retry'}</button>
        <a href={src} target="_blank" rel="noopener noreferrer">{zh ? '打开原图' : 'Open image'}</a>
      </span>}
    </>}
  </span>;
}

/** Parse HTML, sanitize it, then add trusted math and syntax highlighting. */
export default memo(function MarkdownText({ text, language = 'zh', sourceUrl }: { text: string; language?: 'zh' | 'en'; sourceUrl?: string }) {
  const prefix = `preview-${useId()}-`;
  // Stable renderer types preserve image requests and state when the Markdown text changes.
  const components = useMemo<Components>(() => ({
    p: ({ node: _node, className, ...props }) => className === 'preview-empty-marker' ? <PreviewEmpty language={language} /> : <p className={className} {...props} />,
    a: ({ node: _node, href, ...props }) => <ImageLinkContext.Provider value={true}><a {...props} href={href} target={href?.startsWith('#') ? undefined : '_blank'} rel="noopener noreferrer"
      onClick={event => {
        if (!href?.startsWith('#')) return;
        event.preventDefault();
        // Keep in-document navigation inside the preview, without changing the app's hash route.
        document.getElementById(href.slice(1))?.scrollIntoView({ block: 'nearest' });
      }} /></ImageLinkContext.Provider>,
    img: ({ src, alt, title, width, height }) => <PreviewImage key={src} src={src} alt={alt} title={title} width={width} height={height} language={language} />,
  }), [language]);
  return <Markdown remarkPlugins={[remarkGfm, remarkMath, remarkAlert]}
    remarkRehypeOptions={{ clobberPrefix: '', footnoteLabel: language === 'zh' ? '脚注' : 'Footnotes', footnoteBackLabel: language === 'zh' ? '返回正文' : 'Back to content' }}
    rehypePlugins={[rehypeRaw, [rehypeSanitize, { ...defaultSchema, attributes, tagNames: [...(defaultSchema.tagNames ?? []), 'mark'], clobberPrefix: prefix }],
      ...(sourceUrl ? [] : [rehypePreviewEmpty]), [rehypeHighlight, { detect: false, ignoreMissing: true }], [rehypeKatex, { trust: false, maxSize: 20, maxExpand: 1000 }]]}
    urlTransform={url => {
      try {
        if (url.startsWith('#')) return `#${prefix}${decodeURIComponent(url.slice(1))}`;
        return defaultUrlTransform(sourceUrl ? new URL(url, sourceUrl).href : url.startsWith('//') ? `https:${url}` : url);
      } catch { return ''; }
    }}
    components={components}>{text}</Markdown>;
});
