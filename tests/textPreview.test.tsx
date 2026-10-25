import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import MarkdownText from '../src/components/MarkdownText';
import { readPreviewText } from '../src/lib/textPreview';

const value = '# Answer\n\n**Bold**\n\n- first\n- second\n\n```js\nconst x = "\\n";\n```\n\n$\\frac{a}{b}$\n\n$$\n\\sum_{i=1}^{n} i\n$$';
assert.equal(readPreviewText(JSON.stringify({ messages: [{ content: value }] }), ['messages', 0, 'content']), value);
assert.equal(readPreviewText(' /* header */ "hello"', []), 'hello');
assert.equal(readPreviewText('{"a":"","a.b":"\\\\n","n":12345678901234567890}', ['a']), '');
assert.equal(readPreviewText('{"a.b":"\\\\n"}', ['a.b']), '\\n');
assert.equal(readPreviewText('{"n":12345678901234567890}', ['n']), null);
assert.equal(readPreviewText('{"content":{}}', ['content']), null);
assert.equal(readPreviewText('{"content":"unterminated}', ['content']), null);
assert.throws(() => readPreviewText('{}', ['missing']));
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
assert.doesNotMatch(renderToStaticMarkup(<MarkdownText text="![bad](javascript:alert%281%29)" />), /<img/);
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
console.log('Text preview: JSON decoding, Markdown, math, and unsafe-content tests passed.');
