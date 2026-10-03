import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/** Style CM6's own UI; palette variables also update without rebuilding the editor. */
export function editorTheme(dark: boolean) {
  const accent = 'var(--p-interactive, #6579d9)';
  const subtle = 'color-mix(in srgb, var(--tip-fg) 68%, transparent)';
  const wash = 'color-mix(in srgb, var(--tip-fg) 4%, var(--tip-bg))';
  return [EditorView.theme({
    '&': { height: '420px', backgroundColor: 'var(--p-editor, var(--tip-bg))', color: 'var(--tip-fg)', fontSize: '13px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { overflow: 'auto', fontFamily: '"Cascadia Code", "SFMono-Regular", Consolas, monospace', lineHeight: '24px', scrollbarWidth: 'thin', scrollbarColor: 'var(--tip-border) transparent' },
    '.cm-content': { padding: '18px 0', caretColor: accent },
    '.cm-line': { padding: '0 12px 0 4px' },
    '.cm-gutters': { backgroundColor: 'transparent', color: subtle, border: 'none', userSelect: 'none' },
    '.cm-lineNumbers .cm-gutterElement': { minWidth: '36px', padding: '0 6px 0 12px', fontSize: '11px' },
    '.cm-foldGutter .cm-gutterElement': { width: '16px', padding: '0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    '.cm-foldGutter .cm-gutterElement:hover': { color: accent },
    '.cm-foldChevron': { width: '6px', height: '6px', borderRight: '1.5px solid currentColor', borderBottom: '1.5px solid currentColor', transform: 'rotate(-45deg)', opacity: '0' },
    '.cm-foldChevron[data-open=true]': { transform: 'translateY(-2px) rotate(45deg)' },
    '.cm-scroller:hover .cm-foldChevron': { opacity: '1' },
    '@media (hover: none)': { '.cm-foldChevron': { opacity: '1' } },
    '.cm-activeLine': { backgroundColor: wash },
    '.cm-activeLineGutter': { color: accent, backgroundColor: 'transparent' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: accent, borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: dark ? '#8b9ffc30' : '#6579d924' },
    '&.cm-focused .cm-matchingBracket': { color: accent, backgroundColor: 'color-mix(in srgb, var(--tip-fg) 9%, transparent)', borderRadius: '3px', outline: '1px solid var(--tip-border)' },
    '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: 'none', borderRadius: '4px', color: subtle, padding: '0 4px', margin: '0 2px', cursor: 'pointer' },
    '.cm-foldPlaceholder:hover': { color: accent, backgroundColor: wash },
    '.cm-panels': { backgroundColor: 'var(--tip-bg)', color: 'var(--tip-fg)', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '11px' },
    '.cm-panels-top': { borderBottom: '1px solid var(--tip-border)' },
    '.cm-search': { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '7px', padding: '12px 44px 12px 16px !important' },
    '.cm-search input[name=search]': { order: '-3' },
    '.cm-search button[name=prev]': { order: '-2' },
    '.cm-search button[name=next]': { order: '-1' },
    '.cm-search br': { flexBasis: '100%', height: '0' },
    '.cm-search label': { position: 'relative', display: 'inline-flex', alignItems: 'center', height: '30px', padding: '0 9px', border: '1px solid transparent', borderRadius: '7px', whiteSpace: 'nowrap', margin: '0', color: subtle, cursor: 'pointer' },
    '.cm-search label:hover': { background: wash, color: 'var(--tip-fg)' },
    '.cm-search label:has(input:checked)': { color: accent, borderColor: 'color-mix(in srgb, '+accent+' 45%, transparent)', background: 'color-mix(in srgb, '+accent+' 12%, var(--tip-bg))' },
    '.cm-search label:has(input:focus-visible)': { outline: '2px solid '+accent, outlineOffset: '2px' },
    '.cm-search input[type=checkbox]': { position: 'absolute', inset: '0', width: '100%', height: '100%', margin: '0', opacity: '0', cursor: 'pointer' },
    '.cm-textfield': { width: 'min(240px, 100%)', minWidth: '100px', height: '30px', padding: '5px 10px', border: '1px solid var(--tip-border)', borderRadius: '7px', color: 'var(--tip-fg)', background: wash, font: 'inherit', outline: 'none' },
    '.cm-textfield:focus': { borderColor: accent, boxShadow: '0 0 0 2px color-mix(in srgb, var(--tip-fg) 7%, transparent)' },
    '.cm-button': { height: '30px', padding: '0 10px', margin: '0', border: '1px solid var(--tip-border)', borderRadius: '7px', background: 'var(--tip-bg)', color: 'var(--tip-fg)', font: 'inherit', textTransform: 'none', cursor: 'pointer' },
    '.cm-button:hover': { background: wash, borderColor: accent },
    '.cm-panels .cm-search button[name=close]': { top: '12px', right: '12px', width: '26px', height: '28px', color: subtle, fontSize: '18px', borderRadius: '6px' },
    '.cm-panels .cm-search button[name=close]:hover': { color: 'var(--tip-fg)', background: wash },
    '.cm-searchMatch': { backgroundColor: dark ? '#e5ba5340' : '#f1ce7050', borderRadius: '2px' },
    '.cm-searchMatch-selected': { backgroundColor: dark ? '#e5ba5370' : '#e9b64f80' },
    '.cm-tooltip': { border: '1px solid var(--tip-border)', borderRadius: '9px', backgroundColor: 'var(--tip-bg)', color: 'var(--tip-fg)', boxShadow: 'var(--tip-shadow)', overflow: 'hidden', font: '12px/1.7 Inter, system-ui, sans-serif' },
    '.cm-tooltip-lint': { padding: '4px', maxWidth: 'min(420px, 85vw)' },
    '.cm-diagnostic': { padding: '8px 10px', margin: '0', borderRadius: '5px', borderLeft: 'none' },
    '.cm-diagnostic-error': { backgroundColor: 'color-mix(in srgb, #dc6574 7%, transparent)' },
    '.cm-diagnostic-warning': { backgroundColor: 'color-mix(in srgb, #c59640 7%, transparent)' },
    '.cm-diagnosticText': { whiteSpace: 'pre-line', lineHeight: '1.7' },
    '.cm-diagnosticSource': { fontSize: '10px', color: subtle },
    '.cm-lint-marker': { width: '7px', height: '7px', margin: '8px 3px', borderRadius: '50%', backgroundImage: 'none' },
    '.cm-lint-marker-error': { backgroundColor: '#dc6574' },
    '.cm-lint-marker-warning': { backgroundColor: '#c59640' },
    '@media (max-width: 650px)': {
      '.cm-search': { paddingLeft: '10px !important', gap: '6px' },
      '.cm-textfield': { flex: '1 1 160px' },
      '.cm-lineNumbers .cm-gutterElement': { paddingLeft: '6px', minWidth: '28px' },
    },
  }, { dark }), syntaxHighlighting(HighlightStyle.define([
    { tag: tags.propertyName, color: dark ? '#a8c7fa' : '#435f91' },
    { tag: tags.string, color: dark ? '#a2d9b3' : '#32785a' },
    { tag: tags.number, color: dark ? '#efc18c' : '#a7662c' },
    { tag: [tags.bool, tags.null], color: dark ? '#c5b1f0' : '#8260ac' },
    { tag: [tags.punctuation, tags.bracket], color: dark ? '#91a2b7' : '#8190a3' },
    { tag: tags.comment, color: dark ? '#8393a7' : '#8a96a5', fontStyle: 'italic' },
    { tag: tags.invalid, color: dark ? '#f4a2ad' : '#c34c60' },
  ]))];
}

export const chineseEditorPhrases = {
  Find: '查找', Replace: '替换为', next: '下一个', previous: '上一个', all: '全选匹配',
  'match case': '区分大小写', regexp: '正则', 'by word': '全词', replace: '替换', 'replace all': '全部替换', close: '关闭',
  'No diagnostics': '没有问题', 'Fold line': '折叠此行', 'Unfold line': '展开此行',
};
