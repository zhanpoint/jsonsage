import { useEffect, useRef } from 'react';
import { BookOpen, ChevronDown, ExternalLink, X } from 'lucide-react';
import type { PaletteCommand } from './CommandPalette';
import { shortcutLabel } from '../lib/shortcuts';
import './commandGuide.css';

const guide = [
  { id: 'validate', zh: ['检查语法，定位问题，不修改内容。', '按当前 JSON / JSONC 模式扫描语法，报告错误位置和重复键等警告；点击问题可跳到对应字符。', 'JSONC 允许注释和尾随逗号。语法通过不代表字段符合业务规则，也不等于 JSON Schema 校验。'], en: ['Check syntax without changing content.', 'Scan in the current JSON / JSONC mode and report error locations and warnings such as duplicate keys. Select an issue to locate it.', 'JSONC allows comments and trailing commas. Valid syntax does not imply valid business data or JSON Schema compliance.'], before: '{"active": true,}', after: 'JSON: error · JSONC: valid' },
  { id: 'repair', zh: ['将常见的“伪 JSON”修复为可解析内容。', '清理字符串外的部分不可见字符，再由 jsonrepair 修复单引号、未加引号的键、尾随逗号等语法，最后重新校验。', '已合法的内容保持原样；失败时保留原文。JSON 模式移除注释；JSONC 修复时可能将注释放到顶部。推断出的内容务必复核。'], en: ['Repair common JSON-like input.', 'Remove selected invisible characters outside strings, use jsonrepair to repair syntax, then validate again.', 'Valid input is unchanged; failures preserve the original. JSON removes comments; JSONC repairs may move them to the top. Review inferred content.'], before: "{name: 'Ada',}", after: '{"name": "Ada"}' },
  { id: 'mask', zh: ['替换常见敏感信息，便于分享测试数据。', '扫描值的原始位置：敏感字段名（如 password、token）下的非空标量替换为 [redacted]；对邮箱、手机号、身份证、银行卡及 IP 应用内置规则。银行卡还会检查 Luhn 校验和。', '先通过语法检查，再仅替换命中的值；数字可能变为占位字符串。规则无法覆盖所有隐私信息，分享前请检查自定义字段及注释。'], en: ['Replace common sensitive data before sharing.', 'Scan scalar spans: redact non-null values under sensitive keys such as password or token, and match email, phone, identity, card and IP patterns. Card matching also checks the Luhn checksum.', 'Requires valid syntax. Only matching spans change; numbers may become placeholder strings. Review custom fields and comments before sharing.'], before: '{"token":"abc","email":"ada@example.com"}', after: '{"token":"[redacted]","email":"[email]"}' },
  { id: 'format', zh: ['调整缩进和换行，让结构易读。', '先检查语法，再按设置中的 2 空格、4 空格或 Tab 排版。使用语法标记和文本编辑，不经过普通 JSON.parse 后重新序列化。', '保留数字原文、键顺序和字符串内空白，避免大整数精度损失；不修复错误、不排序键。示例使用 2 空格。'], en: ['Make the structure readable with indentation.', 'Validate first, then apply the configured 2 spaces, 4 spaces or Tab. Work with tokens and text edits rather than a JSON.parse / stringify round trip.', 'Preserves numeric literals, key order and whitespace inside strings. Does not repair syntax or sort keys. This example uses 2 spaces.'], before: '{"id":18446744073709551615}', after: '{\n  "id": 18446744073709551615\n}' },
  { id: 'minify', zh: ['去掉不必要的排版空白，缩短文本。', '先检查语法，再扫描并保留原始语法标记，移除字符串外的空格和换行。', '字符串内容和数字原文不变。JSONC 注释保留，单行注释后的换行也保留，因此不一定只有一行；这不是 ZIP 压缩。'], en: ['Remove unnecessary formatting whitespace.', 'Validate, scan tokens and remove spaces and line breaks outside strings.', 'Strings and numeric literals stay intact. JSONC comments and required line-comment newlines remain, so output may span multiple lines. This is not ZIP compression.'], before: '{\n  "name": "Ada Lovelace"\n}', after: '{"name":"Ada Lovelace"}' },
  { id: 'escape', zh: ['将整段文本变为可嵌入 JSON 的字符串。', '对当前文本执行 JSON.stringify，转义双引号、反斜杠和换行，并加上外层双引号。', '输入不必是合法 JSON；输出类型是字符串，不再是原来的对象或数组。转义不是加密。'], en: ['Turn text into a JSON string literal.', 'Apply JSON.stringify to the full text, escaping quotes, backslashes and line breaks, with enclosing quotes.', 'Input need not be valid JSON. Output is a string, not the original object or array. Escaping is not encryption.'], before: '{"id":1}', after: '"{\\"id\\":1}"' },
  { id: 'unescape', zh: ['还原一层转义，恢复可读文本。', '接受完整 JSON 字符串或不带外层引号的转义正文，用 JSON 字符串解析规则解码一层，不执行代码。', '无法解码时保留原文；不会递归解码多层，也不保证还原后的文本是合法 JSON，可再点击校验。'], en: ['Decode one layer of escaping.', 'Accept a JSON string literal or escaped body without enclosing quotes. Decode with JSON string parsing rules; never execute code.', 'Failures preserve input. Only one layer is decoded; the resulting text is not necessarily valid JSON. Validate it separately.'], before: '"{\\"id\\":1}"', after: '{"id":1}' },
] as const;

export default function CommandGuide({ commands, language, onClose }: { commands: PaletteCommand[]; language: 'zh' | 'en'; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const zh = language === 'zh';
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="shortcut-dialog command-guide" aria-labelledby="command-guide-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header><BookOpen size={18} /><strong id="command-guide-title">{zh ? '命令使用指南' : 'Command guide'}</strong><button className="tool-button" onClick={onClose} aria-label={zh ? '关闭文档' : 'Close guide'}><X size={18} /></button></header>
    <div className="guide-body">
      <p className="guide-lead">{zh ? '从左到右，认识工具栏的七个操作。点击条目查看机制与示例。' : 'Seven toolbar actions, from left to right. Expand an action for details and examples.'}</p>
      <p className="guide-workflow">{zh ? '常用流程：校验 → 按需修复 → 美化 → 分享前脱敏。' : 'Typical workflow: validate → repair if needed → format → mask before sharing.'}</p>
      {guide.map(item => {
        const command = commands.find(command => command.id === item.id)!;
        const [purpose, mechanism, note] = item[language];
        return <details key={item.id} className="guide-entry">
          <summary><span className="command-icon" data-tone={command.tone}><command.icon size={18} /></span><span className="guide-summary"><strong>{command.label}</strong><span>{purpose}</span></span><kbd>{shortcutLabel(command.binding)}</kbd><ChevronDown size={15} className="guide-chevron" /></summary>
          <div className="guide-detail"><p><strong>{zh ? '如何处理' : 'How it works'}</strong>{mechanism}</p><div className="guide-example"><div><span>{zh ? '输入' : 'Input'}</span><pre><code>{item.before}</code></pre></div><div><span>{zh ? '结果' : 'Result'}</span><pre><code>{item.after}</code></pre></div></div><p className="guide-note"><strong>{zh ? '使用边界' : 'Keep in mind'}</strong>{note}</p></div>
        </details>;
      })}
      <section className="guide-context"><h2>{zh ? '本地处理，结果可控' : 'Local processing, clear boundaries'}</h2><p>{zh ? '上述操作均在浏览器本地完成，转换任务在 Web Worker 中执行，不上传输入内容。URL 导入会请求你指定的地址。修改作用于当前标签页的全文，可用撤销恢复；开启自动保存时，修改会写入此浏览器的历史记录。' : 'These actions run locally; transforms execute in Web Workers without uploading input. URL import contacts the address you specify. Changes affect the full active tab and can be undone. Auto-save writes changes to this browser’s history.'}</p><p>{zh ? '右侧键位反映当前快捷键设置，可在设置中修改。macOS 使用 ⌘，Windows / Linux 使用 Ctrl。' : 'Shortcuts reflect your current settings and can be customized. macOS uses ⌘; Windows / Linux use Ctrl.'}</p></section>
    </div>
    <footer><span>{zh ? '以当前实现为准 · 开源代码可查阅' : 'Based on the current implementation'}</span><a href="https://github.com/zhanpoint/jsonsage" target="_blank" rel="noopener noreferrer">GitHub <ExternalLink size={14} /></a></footer>
  </dialog>;
}
