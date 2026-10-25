import { memo } from 'react';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import PreviewEmpty from './PreviewEmpty';

interface PreviewNode {
  type: string;
  children?: PreviewNode[];
  data?: { hProperties: { className: string } };
}

// Inspect the same parsed tree used for rendering, without parsing twice or
// guessing Markdown syntax from the source text.
function remarkPreviewEmpty() {
  const hasFormatting = (node: PreviewNode): boolean => {
    if (node.type === 'html' || node.type === 'definition') return false;
    if (node.type === 'root' || node.type === 'paragraph') return node.children?.some(hasFormatting) ?? false;
    return node.type !== 'text';
  };
  return (tree: PreviewNode) => {
    if (!hasFormatting(tree)) tree.children = [{
      type: 'paragraph', children: [], data: { hProperties: { className: 'preview-empty-marker' } },
    }];
  };
}

/** Raw HTML stays inert; remote images load only inside the opened preview. */
export default memo(function MarkdownText({ text, language = 'zh', sourceUrl }: { text: string; language?: 'zh' | 'en'; sourceUrl?: string }) {
  return <Markdown remarkPlugins={sourceUrl ? [remarkGfm, remarkMath] : [remarkGfm, remarkMath, remarkPreviewEmpty]} rehypePlugins={[[rehypeKatex, { trust: false, maxSize: 20, maxExpand: 1000 }]]}
    urlTransform={url => { try { return defaultUrlTransform(sourceUrl ? new URL(url, sourceUrl).href : url); } catch { return ''; } }}
    components={{
      p: ({ className, children }) => className === 'preview-empty-marker' ? <PreviewEmpty language={language} /> : <p>{children}</p>,
      a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
      img: ({ alt, src }) => src && /^https?:\/\//i.test(src) ? <img src={src} alt={alt ?? ''} loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : <span className="preview-image-label">[{alt || 'Image'}]</span>,
    }}>{text}</Markdown>;
});
