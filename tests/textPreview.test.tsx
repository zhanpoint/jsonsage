import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import MarkdownText from '../src/components/MarkdownText';
import { DocumentInspector } from '../src/lib/documentInspector';
import type { JsonPath } from '../src/lib/json/views';

async function readPreviewText(source: string, path: JsonPath) {
  const inspector = new DocumentInspector();
  inspector.sync(source, 1);
  return (await inspector.query({ kind: 'preview', path })).text;
}
import optimizationPost from './fixtures/optimization-post.json';

const value = '# Answer\n\n**Bold**\n\n- first\n- second\n\n```js\nconst x = "\\n";\n```\n\n$\\frac{a}{b}$\n\n$$\n\\sum_{i=1}^{n} i\n$$';
assert.equal(await readPreviewText(JSON.stringify({ messages: [{ content: value }] }), ['messages', 0, 'content']), value);
assert.equal(await readPreviewText(' /* header */ "hello"', []), 'hello');
assert.equal(await readPreviewText('{"a":"","a.b":"\\\\n","n":12345678901234567890}', ['a']), '');
assert.equal(await readPreviewText('{"a.b":"\\\\n"}', ['a.b']), '\\n');
assert.equal(await readPreviewText('{"n":12345678901234567890}', ['n']), null);
assert.equal(await readPreviewText('{"content":{}}', ['content']), null);
assert.equal(await readPreviewText('{"content":"unterminated}', ['content']), null);
assert.equal(await readPreviewText('{}', ['missing']), null);
const html = renderToStaticMarkup(<MarkdownText text={value} />);
assert.match(html, /<h1>Answer<\/h1>/);
assert.match(html, /<strong>Bold<\/strong>/);
assert.match(html, /<ul>/);
assert.match(html, /language-js/);
assert.match(html, /class="katex"/);
assert.match(html, /katex-display/);
const unsafe = renderToStaticMarkup(<MarkdownText text={'<script>alert(1)</script>\n\n[x](javascript:alert%281%29)\n\n![secret](https://example.com/track)\n\n$\\href{javascript:alert(1)}{bad}$'} />);
assert.doesNotMatch(unsafe, /<script|href="javascript:/);
assert.match(unsafe, /loading="lazy"/);
assert.match(unsafe, /referrerPolicy="no-referrer"/i);
assert.match(unsafe, /data-state="loading"/);
assert.match(unsafe, /正在加载图片/);
assert.doesNotMatch(renderToStaticMarkup(<MarkdownText text="![bad](javascript:alert%281%29)" />), /<img/);
const unresolvedImage = renderToStaticMarkup(<MarkdownText text="![missing](./photo.jpg)" />);
assert.match(unresolvedImage, /data-state="error"/);
assert.match(unresolvedImage, /无法解析图片地址/);
assert.doesNotMatch(unresolvedImage, /<button|打开原图/);
const linkedImage = renderToStaticMarkup(<MarkdownText text="[![image](https://example.com/a.jpg)](https://example.com)" />);
assert.equal((linkedImage.match(/<a /g) ?? []).length, 1);
assert.doesNotMatch(linkedImage, /<button/);
const brokenMath = renderToStaticMarkup(<MarkdownText text={'$\\frac{$'} />);
assert.match(brokenMath, /katex-error/);
for (const text of ['', '   ', '普通文本', 'first\n\nsecond', 'price: $20', '\\*literal\\*']) {
  const empty = renderToStaticMarkup(<MarkdownText text={text} />);
  assert.match(empty, /text-preview-empty/);
  assert.match(empty, /暂无 Markdown 或公式可预览/);
}
for (const text of ['# Heading', '**bold**', '`code`', '- item', '$x^2$', '[link](https://example.com)']) {
  assert.doesNotMatch(renderToStaticMarkup(<MarkdownText text={text} />), /text-preview-empty/);
}
assert.match(renderToStaticMarkup(<MarkdownText text="plain" language="en" />), /No Markdown or math to preview/);
const file = renderToStaticMarkup(<MarkdownText text={'plain\n\n![image](./a.png)\n\n[bad](javascript:alert%281%29)'} sourceUrl="https://example.com/docs/readme.md" />);
assert.match(file, /<p>plain<\/p>/);
assert.match(file, /src="https:\/\/example.com\/docs\/a.png"/);
assert.doesNotMatch(file, /href="javascript:/);
const rich = renderToStaticMarkup(<MarkdownText text={'# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n\n~~removed~~ and *emphasis*\n\n---\n\n1. first\n2. second\n\n- [x] done\n- [ ] next\n\n| Name | Value |\n| --- | ---: |\n| one | 1 |\n\n> [!TIP]\n> A helpful tip.\n\nA note[^one].\n\n[^one]: Footnote text.\n\n```js\nconst count = 42;\n```\n\n```unknown-language\nkeep this code\n```'} />);
for (let level = 1; level <= 6; level++) assert.match(rich, new RegExp(`<h${level}>`));
assert.match(rich, /<del>removed<\/del>/);
assert.match(rich, /<table>/);
assert.match(rich, /type="checkbox" disabled="" checked=""/);
assert.match(rich, /markdown-alert-tip/);
assert.match(rich, /class="markdown-alert-title"/);
assert.match(rich, /hljs-keyword/);
assert.match(rich, /keep this code/);
assert.match(rich, /data-footnotes/);
const footnoteTarget = rich.match(/data-footnote-ref=""[^>]*href="#([^"]+)"/);
assert.ok(footnoteTarget);
assert.ok(rich.includes(`id="${footnoteTarget[1]}"`), 'Footnotes link to the sanitized ID');
assert.doesNotMatch(rich, /href="#[^"]+" target="_blank"/);
const safeHtml = renderToStaticMarkup(<MarkdownText text={'<details><summary>More</summary><p>H<sub>2</sub>O and x<sup>2</sup>, <kbd>Ctrl</kbd>, <mark>highlight</mark></p></details>\n\n<img src="https://example.com/photo.png" alt="Photo" width="320" onerror="alert(1)" style="position:fixed">\n\n<script>alert(1)</script><iframe src="https://example.com"></iframe><svg onload="alert(1)"></svg>\n\n<a href="javascript:alert(1)">unsafe</a>'} />);
assert.match(safeHtml, /<details><summary>More<\/summary>/);
assert.match(safeHtml, /<sub>2<\/sub>/);
assert.match(safeHtml, /<sup>2<\/sup>/);
assert.match(safeHtml, /<mark>highlight<\/mark>/);
assert.match(safeHtml, /src="https:\/\/example.com\/photo.png"/);
assert.doesNotMatch(safeHtml, /<script|<iframe|<svg|onerror=|onload=|position:fixed|href="javascript:/);
assert.doesNotMatch(safeHtml, /text-preview-empty/);
assert.match(renderToStaticMarkup(<MarkdownText text="![photo](//example.com/photo.png)" />), /src="https:\/\/example.com\/photo.png"/);
// A failed image request must not prevent this complete document from rendering.
const optimizationText = await readPreviewText(JSON.stringify(optimizationPost), ['content_markdown']);
assert.equal(optimizationText, optimizationPost.content_markdown);
const optimizationHtml = renderToStaticMarkup(<MarkdownText text={optimizationText!} />);
assert.match(optimizationHtml, /<h1>优化算法导论：从 SGD 到 Adam<\/h1>/);
assert.match(optimizationHtml, /<table>/);
assert.match(optimizationHtml, /alt="Loss Landscape"/);
assert.match(optimizationHtml, /<strong>核心直觉<\/strong>/);
assert.equal((optimizationHtml.match(/class="katex"/g) ?? []).length, 14);
assert.equal((optimizationHtml.match(/type="checkbox"/g) ?? []).length, 3);
assert.doesNotMatch(optimizationHtml, /katex-error|text-preview-empty/);
console.log('Text preview: JSON decoding, Markdown, math, and unsafe-content tests passed.');
