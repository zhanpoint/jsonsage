import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, CircleAlert, BookOpen, Code2, Globe2, Moon, Palette, Sun, Command, MonitorDown, PanelRight, Github, ChevronsUp, ChevronsDown } from 'lucide-react';
import { lineColumn as position, type JsonDiagnostic } from './lib/json/engine';
import { isRecordStream } from './lib/json/document';
import { type Indent } from './lib/json/transforms';
import { useJsonTransform } from './hooks/useJsonTransform';
import type { EditorHandle, HistoryState } from './components/CodeEditor';
import { useJsonValidation } from './hooks/useJsonValidation';
import { useDocumentTree } from './hooks/useDocumentTree';
import { pathText, STRUCTURE_LIMIT, type JsonPath } from './lib/json/views';
import { useCursorPath } from './hooks/useCursorPath';
import { useInstall } from './hooks/useInstall';
import type { PaletteCommand } from './components/CommandPalette';
const CommandGuide = lazy(() => import('./components/CommandGuide'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));
const AnalysisTools = lazy(() => import('./components/AnalysisTools'));
const RemoteImport = lazy(() => import('./components/RemoteImport'));
const CodeEditor = lazy(() => import('./components/CodeEditor'));
const TextPreview = lazy(() => import('./components/TextPreview'));
import DataView from './components/DataView';
import PathBreadcrumbs from './components/PathBreadcrumbs';
import EditorViewport from './components/EditorViewport';
import PreviewWorkspace from './components/PreviewWorkspace';
import type { TreeFoldRequest } from './components/StructuredViews';
import './views.css';
import { PathMenu, type PathMenuTarget } from './components/PathMenu';
import { MAX_IMPORT_BYTES } from './lib/importDocument';
import { EditorSettings } from './components/EditorSettings';
import { commandDefinitions, viewTabs, type CommandId } from './lib/commands';
import { shortcutLabel } from './lib/shortcuts';
import { useShortcuts, useCommandKeyboard } from './hooks/useShortcuts';
import { CommandButton } from './components/ui/CommandButton';
import { activeEditor } from './lib/codeEditor';
const ShortcutSettings = lazy(() => import('./components/ShortcutSettings'));
import HistoryMenu from './components/HistoryMenu';
import { DocumentTabs } from './components/DocumentTabs';
import { HelpTooltip } from './components/ui/HelpTooltip';
import { useDocumentWorkspace } from './hooks/useDocumentWorkspace';
import type { DocumentView } from './lib/documentWorkspace';
import { newHistoryDraft, type HistoryDraft } from './lib/historySession';
import { historyError, historyStore, HistoryConflict, type HistoryEntry } from './lib/history';

type Language = 'en' | 'zh';
type Theme = 'light' | 'dark';

const palettes = [
  { id: 'default', en: 'Original', zh: '经典', swatch: '#596bdf' },
  { id: 'zen-linen', en: 'Zen Linen', zh: '亚麻', swatch: '#2e2e2e' },
  { id: 'nature', en: 'Nature', zh: '自然', swatch: '#2e7d32' },
] as const;
type PaletteId = typeof palettes[number]['id'];

const messages = {
  en: {
    language: 'Language', theme: 'Switch to dark theme', lightTheme: 'Switch to light theme', palette: 'Color theme',
    jsonGuide: 'JSON guide',
    validate: 'Validate', autoFix: 'Auto-Fix', undo: 'Undo', redo: 'Redo',
    minify: 'Minify', escape: 'Escape', unescape: 'Unescape',
    valid: 'Valid for the current mode.', invalid: 'Invalid for the current mode. Select an issue to locate it.',
    repaired: 'Repaired and validated. Review the result; missing data may have been inferred.',
    commentsMoved: 'Repaired as JSONC. Comments were retained at the top; review the result.',
    transformed: 'Text updated.', unescapeFailed: 'Invalid escaped string. Original text unchanged.',
    unchanged: 'Already valid in the current mode; no repair needed.', repairFailed: 'Repair failed. Your original text is unchanged.',
    editor: 'JSON editor', file: 'Filename', mode: 'Enable JSONC mode', format: 'Format', copy: 'Copy', copied: 'Copied', open: 'Open', export: 'Export',
    source: 'JSON source', utf8: 'UTF-8', lines: 'lines', chars: 'chars', lineShort: 'Ln', columnShort: 'Col',
    issuesTab: 'Issues',
    good: 'Everything looks good',
    importFailed: 'Unable to read the file. Please choose it again.', tooLarge: 'Import supports files up to 128 MiB.', copyFailed: 'Could not copy. Check clipboard permissions.', errors: 'errors', warnings: 'warnings',
    privacy: 'All computation stays on your device. No data is uploaded.',
    diagnostic: {
      E027: ['Input contains invalid UTF-8 bytes', 'Re-encode the input as UTF-8.'],
      E016: ['Unescaped control character in string', 'Escape control characters in strings.'],
      E013: ['Unterminated string', 'Close the string with a double quote.'],
      W060: ['Duplicate object key', 'The last value for this key takes precedence.'],
      E010: ['Strings must use double quotes', 'JSON strings use double quotes.'],
      E020: ['Unterminated block comment', 'Close the comment with */.'],
      E021: ['Comments are not allowed in strict JSON', 'Enable JSONC mode to allow comments.'],
      E008: ['Trailing comma is not allowed in strict JSON', 'Enable JSONC mode to allow trailing commas.'],
      E030: ['Invalid value', 'Use a valid JSON value.'],
      E001: ['Invalid JSON syntax', 'Check the syntax at this location.'],
    },
  },
  zh: {
    language: '语言', theme: '切换到深色主题', lightTheme: '切换到浅色主题', palette: '主题配色',
    jsonGuide: 'JSON 指南',
    validate: '验证', autoFix: '自动修复', undo: '撤销', redo: '重做',
    minify: '压缩', escape: '转义', unescape: '反转义',
    valid: '符合当前模式的语法规则。', invalid: '不符合当前模式的语法规则，点击问题可定位。',
    repaired: '已修复并通过当前模式校验，请检查结果；缺失内容可能经过推断。',
    commentsMoved: '已按 JSONC 修复，注释保留并集中到文件顶部，请检查结果。',
    transformed: '已更新文本。', unescapeFailed: '转义字符串无效，已保留原文。',
    unchanged: '当前模式下内容已合法，无需修复。', repairFailed: '修复失败，已保留原文。',
    editor: 'JSON 编辑器', file: '文件名', mode: '启用 JSONC 模式', format: '美化', copy: '复制', copied: '已复制', open: '打开', export: '导出',
    source: 'JSON 源码', utf8: 'UTF-8', lines: '行', chars: '字符', lineShort: '第', columnShort: '列',
    issuesTab: '问题',
    good: '内容正确',
    importFailed: '文件读取失败，请重新选择文件。', tooLarge: '支持导入 128 MiB 以内的文件。', copyFailed: '复制失败，请检查剪贴板权限。', errors: '个错误', warnings: '个警告',
    privacy: '所有计算均在本地完成，JSON 数据不会上传。',
    diagnostic: {
      E027: ['输入包含无效的 UTF-8 字节', '请将输入重新编码为 UTF-8。'],
      E016: ['字符串中含有未转义的控制字符', '请转义字符串中的控制字符。'],
      E013: ['字符串未闭合', '请使用双引号闭合字符串。'],
      W060: ['对象中存在重复键', '该键的最后一个值会生效。'],
      E010: ['字符串必须使用双引号', 'JSON 字符串必须使用双引号。'],
      E020: ['块注释未闭合', '请使用 */ 结束注释。'],
      E021: ['严格 JSON 不允许注释', '启用 JSONC 模式以允许注释。'],
      E008: ['严格 JSON 不允许尾随逗号', '启用 JSONC 模式以允许尾随逗号。'],
      E030: ['无效的值', '请使用有效的 JSON 值。'],
      E001: ['JSON 语法无效', '请检查此处的语法。'],
    },
  },
} as const;

const starter = `{
  "name": "JsonSage",
  "version": "1.0.0",
  "description": "A calmer way to work with JSON",
  "features": ["validate", "format", "inspect"],
  "active": true
}`;

const syntaxZh: Record<string, [string, string]> = {
    S1: ['无效字符或未加引号的键名', '键名和字符串必须使用双引号。'],
    S2: ['数字格式无效', '请检查前导零、小数和指数格式。'],
    S3: ['缺少双引号包围的键名', '补充键名，或移除多余逗号。'],
    S4: ['缺少 JSON 值', '请提供字符串、数字、对象、数组、布尔值或 null。'],
    S5: ['键名后缺少冒号', '在键名和值之间插入冒号。'],
    S6: ['项目之间缺少逗号', '使用逗号分隔属性或数组元素。'],
    S7: ['对象缺少右花括号 }', '补充闭合对象的 }。'],
    S8: ['数组缺少右方括号 ]', '补充闭合数组的 ]。'],
    S9: ['JSON 值后存在多余内容', '移除根值后的多余括号或其他内容。'],
    S10: ['严格 JSON 不允许注释', '启用 JSONC 模式以允许注释。'],
    S11: ['块注释未闭合', '请使用 */ 结束注释。'],
    S13: ['数字不完整', '请补全小数或指数部分。'],
    S12: ['字符串未闭合', '使用双引号闭合字符串。'],
    S14: ['Unicode 转义无效', 'Unicode 转义需要四位十六进制数字。'],
    S15: ['字符串转义无效', '使用有效的 JSON 转义，或转义反斜杠。'],
    S16: ['字符串含未转义的控制字符', '请转义换行、制表符等控制字符。'],
  };
function localizedDiagnostic(diagnostic: JsonDiagnostic, language: Language) {
  const translated = (language === 'zh' ? syntaxZh[diagnostic.code] : undefined) ?? messages[language].diagnostic[diagnostic.code as keyof typeof messages.en.diagnostic];
  if (!translated) return { message: diagnostic.message, hint: diagnostic.hint };

  const detail = diagnostic.code === 'W060'
    ? diagnostic.message.slice('duplicate object key'.length)
    : diagnostic.code === 'E030'
      ? `: ${diagnostic.message.slice("'".length, -"' is not valid JSON".length)}`
      : diagnostic.code === 'E001'
        ? diagnostic.message.match(/ \(line .*\)$/)?.[0] ?? ''
        : '';
  return {
    message: `${translated[0]}${detail}`,
    hint: diagnostic.hint ? translated[1] : undefined,
  };
}

export default function App() {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('jsonsage-language');
    if (saved === 'zh' || saved === 'en') return saved;
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  });
  const [theme, setTheme] = useState<Theme>(() => localStorage.getItem('jsonsage-theme') === 'light' ? 'light' : 'dark');
  const [palette, setPalette] = useState<PaletteId>(() => {
    const saved = localStorage.getItem('jsonsage-palette');
    return palettes.find((item) => item.id === saved)?.id ?? 'default';
  });
  const [languageOpen, setLanguageOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const languagePickerRef = useRef<HTMLDivElement>(null);
  const languageButtonRef = useRef<HTMLButtonElement>(null);
  const palettePickerRef = useRef<HTMLDivElement>(null);
  const paletteButtonRef = useRef<HTMLButtonElement>(null);
  const t = messages[language];
  useEffect(() => {
    localStorage.setItem('jsonsage-language', language);
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);
  useEffect(() => {
    localStorage.setItem('jsonsage-theme', theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem('jsonsage-palette', palette);
  }, [palette]);
  useEffect(() => {
    if (!languageOpen && !paletteOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (languageOpen && !languagePickerRef.current?.contains(event.target as Node)) setLanguageOpen(false);
      if (paletteOpen && !palettePickerRef.current?.contains(event.target as Node)) setPaletteOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (languageOpen) languageButtonRef.current?.focus();
        if (paletteOpen) paletteButtonRef.current?.focus();
        setLanguageOpen(false);
        setPaletteOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [languageOpen, paletteOpen]);
  const inputRef = useRef<EditorHandle | null>(null);
  const [autoSave, setAutoSave] = useState(() => localStorage.getItem('jsonsage-auto-save') !== 'false');
  useEffect(() => { localStorage.setItem('jsonsage-auto-save', String(autoSave)); }, [autoSave]);
  const documents = useDocumentWorkspace(newHistoryDraft({ source: starter, fileName: 'document.json', jsonc: false }), autoSave, () => inputRef.current?.flush());
  const { workspace, active } = documents;
  const session = active.session;
  const documentHistory = session.snapshot();
  const documentIds = useMemo(() => documents.tabs.map(tab => tab.id), [documents.tabs]);
  const { source, fileName, jsonc } = documentHistory.draft!;
  const setSource = useCallback((source: string) => session.change({ source }), [session]);
  const renameTab = (id: string, fileName: string) => {
    const target = documents.tabs.find(tab => tab.id === id)?.session;
    const value = target?.snapshot().draft;
    if (!target || !value) return;
    target.change({ fileName, title: value.title === newHistoryDraft(value).title ? newHistoryDraft({ ...value, fileName }).title : value.title });
  };
  const setJsonc = (jsonc: boolean) => session.change({ jsonc });
  const fileLoadSequence = useRef(0);
  useEffect(() => () => { fileLoadSequence.current++; }, []);
  const { view, compareSource } = active.tools;
  const setView = (view: DocumentView) => workspace.updateTools(active.id, { view });
  const setCompareSource = (compareSource: string) => workspace.updateTools(active.id, { compareSource });
  const [treeFold, setTreeFold] = useState<TreeFoldRequest | null>(null);
  function foldViews(folded: boolean) { inputRef.current?.setFolded(folded); setTreeFold(previous => ({ folded, id: (previous?.id ?? 0) + 1 })); }
  const [commandOpen, setCommandOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const shortcuts = useShortcuts();
  const fileInput = useRef<HTMLInputElement>(null);
  const install = useInstall();
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [pathMenu, setPathMenu] = useState<PathMenuTarget | null>(null);
  const [textPreview, setTextPreview] = useState<{ path: JsonPath } | null>(null);
  const openTextPreview = (path: JsonPath) => setTextPreview({ path });
  useEffect(() => { setTextPreview(null); }, [active.id]);
  const openPathMenu = useCallback((event: { clientX: number; clientY: number; preventDefault: () => void }, path: JsonPath) => {
    event.preventDefault();
    setPathMenu({ x: event.clientX, y: event.clientY, path });
  }, []);
  const [indent, setIndent] = useState<Indent>(() => {
    const saved = localStorage.getItem('jsonsage-indent');
    return saved === '4' || saved === 'tab' ? saved : '2';
  });
  useEffect(() => { localStorage.setItem('jsonsage-indent', indent); }, [indent]);
  const [notice, storeNotice] = useState<{ text: string; error: boolean } | null>(null);
  const latestMessages = useRef(t); latestMessages.current = t;
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((text: string | null, error = false) => {
    clearTimeout(noticeTimer.current);
    storeNotice(text ? { text, error } : null);
    if (text) noticeTimer.current = setTimeout(() => storeNotice(null), 3000);
  }, []);
  const setNotice = useCallback((code: 'valid' | 'invalid' | 'repaired' | 'commentsMoved' | 'unchanged' | 'repairFailed' | 'transformed' | 'unescapeFailed' | 'copied' | 'copyFailed' | 'importFailed' | 'tooLarge' | null) => notify(code ? latestMessages.current[code] : null, ['invalid', 'repairFailed', 'unescapeFailed', 'copyFailed', 'importFailed', 'tooLarge'].includes(code ?? '')), [notify]);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  useEffect(() => { if (documentHistory.error) notify(historyError(documentHistory.error, language === 'zh'), true); }, [documentHistory.error, language, notify]);
  useEffect(() => { if (documents.error) notify(historyError(documents.error, language === 'zh'), true); }, [documents.error, language, notify]);
  const [historyState, setHistoryState] = useState<HistoryState>({ undo: false, redo: false });
  const syncHistory = useCallback((state: HistoryState, editor: EditorHandle) => {
    if (activeEditor(inputRef.current) === editor) setHistoryState(state);
  }, []);
  useEffect(() => { setHistoryState(activeEditor(inputRef.current)?.history() ?? { undo: false, redo: false }); }, [view, active.id]);
  const options = useMemo(() => ({ mode: jsonc ? 'jsonc' as const : 'strict' as const }), [jsonc]);
  const transform = useJsonTransform(source, indent, options);
  const parsed = useJsonValidation(source, options);
  const structure = useDocumentTree(!parsed.pending && parsed.ok && source.length <= STRUCTURE_LIMIT ? source : null, jsonc);
  const root = structure.root;
  const cursor = useCursorPath(source, root);
  useEffect(() => { setTextPreview(previous => previous ? { ...previous, path: cursor.path } : null); }, [cursor.path]);
  const pasteWorker = useRef<Worker | null>(null);
  useEffect(() => () => pasteWorker.current?.terminate(), []);
  const diagnostics = useMemo(() => parsed.pending ? [] : parsed.diagnostics.map(item => ({ ...item, ...localizedDiagnostic(item, language) })), [parsed.pending, parsed.diagnostics, language]);
  useEffect(() => { setPathMenu(null); }, [source, view, commandOpen]);
  const updateSource = useCallback((next: string) => {
    fileLoadSequence.current++;
    setSource(next);
    setNotice(null);
  }, [setSource, setNotice]);
  function locateIssue(item: JsonDiagnostic) {
    setView('code');
    requestAnimationFrame(() => inputRef.current?.locate(item.start, Math.max(item.start + 1, item.end)));
  }
  function validateSource() {
    setNotice(parsed.ok ? 'valid' : 'invalid');
    const first = parsed.diagnostics.find((item) => item.severity === 'error');
    if (first) locateIssue(first);
  }
  function autoFix() {
    transform.run('repair', repaired => {
      if (!repaired.ok) { setNotice('repairFailed'); return; }
      if (!repaired.changed) { setNotice('unchanged'); return; }
      updateSource(repaired.source);
      setNotice(repaired.commentsMoved ? 'commentsMoved' : 'repaired');
      });
  }
  function applyTransform(next: string) {
    if (next !== source) updateSource(next);
    setNotice('transformed');
  }
  function unescapeSource() {
    transform.run('unescape', output => { if (output.ok) applyTransform(output.source); else setNotice('unescapeFailed'); });
  }
  function smartPaste(text: string, insert: (source: string) => boolean) {
    pasteWorker.current?.terminate();
    const worker = new Worker(new URL('./workers/smartInput.worker.ts', import.meta.url), { type: 'module' });
    pasteWorker.current = worker;
    worker.onmessage = event => {
      if (pasteWorker.current !== worker) return;
      worker.terminate(); pasteWorker.current = null;
      if (event.data?.source !== undefined) {
        if (!insert(event.data.source)) return;
        const labels: Record<string, string> = { url: 'URL', jwt: 'JWT（仅解码，不验证签名）', base64: 'Base64', escaped: '转义 JSON' };
        notify(language === 'zh' ? `已识别并解码 ${labels[event.data.kind] ?? 'JSON'}` : `Decoded ${event.data.kind}${event.data.kind === 'jwt' ? ' (signature not verified)' : ''}`);
      } else if (event.data?.error) notify(language === 'zh' ? 'URL 加载失败，已保留原文。请检查网络或跨域权限。' : 'URL loading failed. Original text retained. Check network/CORS.', true);
    };
    worker.onerror = () => { worker.terminate(); pasteWorker.current = null; notify(language === 'zh' ? '无法处理粘贴内容，已保留原文。' : 'Unable to decode; original paste retained.', true); };
    if (/^https?:\/\//i.test(text.trim())) notify(language === 'zh' ? '正在从 URL 加载…' : 'Loading URL…');
    worker.postMessage(text);
  }
  function maskSource() {
    transform.run('mask', result => {
      if (!result.ok) { validateSource(); return; }
      updateSource(result.source);
      notify(language === 'zh' ? '已脱敏，可撤销。分享前请检查自定义敏感字段。' : 'Masked locally. Undo is available; review custom sensitive fields before sharing.');
    });
  }
  const errors = parsed.diagnostics.filter((item) => item.severity === 'error');
  const warnings = parsed.diagnostics.filter((item) => item.severity === 'warning');
  const lineCount = parsed.metrics?.lineCount ?? '…';
  const characterCount = parsed.metrics?.characterCount;
  const dataViewProps = { treeFold, root, source, language, indent, options, editable: !parsed.diagnostics.some(item => item.code === 'W060'), pending: parsed.pending || structure.pending, valid: parsed.ok, structureError: !!structure.error, onChange: updateSource, onContextPath: openPathMenu, selectedPath: cursor.path };

  async function copySource() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setNotice('copied');
      window.setTimeout(() => setCopied(false), 1400);
    } catch { setNotice('copyFailed'); }
  }

  function formatSource() {
    transform.run('format', output => {
      if (output.ok) applyTransform(output.source);
      else validateSource();
    });
  }
  function minifySource() {
    transform.run('minify', output => {
      if (output.ok) applyTransform(output.source);
      else validateSource();
    });
  }

  const importWorker = useRef<Worker | null>(null);
  const [importing, setImporting] = useState(false);
  useEffect(() => () => importWorker.current?.terminate(), []);
  function loadFile(file?: File) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) { setNotice('tooLarge'); return; }
    const id = ++fileLoadSequence.current;
    importWorker.current?.terminate();
    setImporting(true);
    const worker = new Worker(new URL('./workers/import.worker.ts', import.meta.url), { type: 'module' });
    importWorker.current = worker;
    worker.onmessage = (event: MessageEvent<{ source?: string; error?: string }>) => {
      worker.terminate(); if (importWorker.current === worker) { importWorker.current = null; setImporting(false); }
      if (id !== fileLoadSequence.current) return;
      if (event.data.source === undefined) { setNotice('importFailed'); return; }
      openDocument(newHistoryDraft({ source: event.data.source, fileName: file.name, jsonc: /\.jsonc$/i.test(file.name) }), true);
    };
    worker.onerror = () => { worker.terminate(); if (importWorker.current === worker) { importWorker.current = null; setImporting(false); } if (id === fileLoadSequence.current) setNotice('importFailed'); };
    worker.postMessage(file);
  }
  function copyFormatted() {
    transform.run('format', async result => {
      if (!result.ok) { validateSource(); return; }
      try { await navigator.clipboard.writeText(result.source); setNotice('copied'); }
      catch { setNotice('copyFailed'); }
    });
  }

  function download() {
    const stream = /\.(?:jsonl|ndjson)$/i.test(fileName) || isRecordStream(source);
    const blob = new Blob([source], { type: stream ? 'application/x-ndjson' : 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    const safeName = fileName.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '');
    const extension = stream ? (/\.ndjson$/i.test(safeName) ? '.ndjson' : '.jsonl') : jsonc ? '.jsonc' : '.json';
    anchor.download = (safeName.replace(/\.[^.]*$/, '') || 'document') + extension;
    anchor.click();
    URL.revokeObjectURL(href);
  }
  const viewLabels = language === 'zh' ? { code: '代码', tree: '树形', table: '表格', graph: '节点图', diff: '对比', types: '类型生成' } : { code: 'Code', tree: 'Tree', table: 'Table', graph: 'Graph', diff: 'Diff', types: 'Types' };
  const command = (id: CommandId, label: string, run: () => void, disabled = false): PaletteCommand => {
    const { icon, tone } = commandDefinitions[id];
    return { id, label, run, disabled, icon, tone, binding: shortcuts.bindings[id], nativeEditing: id === 'undo' || id === 'redo' };
  };
  const invalidOrBusy = !parsed.ok && !parsed.pending || transform.busy;
  async function saveDocument() {
    if (!documents.ready) return;
    inputRef.current?.flush();
    try {
      if (!await workspace.save(active.id, true)) return;
      notify(language === 'zh' ? '已保存在此浏览器。' : 'Saved in this browser.');
    } catch { /* The session exposes the failure without discarding edits. */ }
  }
  function prepareTabChange() {
    inputRef.current?.flush();
    transform.cancel(); pasteWorker.current?.terminate(); pasteWorker.current = null;
    fileLoadSequence.current++; setPathMenu(null); setNotice(null); setEditorDirty(false);
  }
  function selectTab(id: string) { if (documents.ready && id !== active.id) { prepareTabChange(); workspace.activate(id); } }
  function openDocument(value?: HistoryDraft, saveImported = false, pinned = false) {
    if (!documents.ready) return;
    prepareTabChange();
    const tab = workspace.open(value, pinned);
    if (autoSave && saveImported) void workspace.save(tab.id, true).catch(() => {});
  }
  async function closeTab(id: string) {
    const tab = documents.tabs.find(tab => tab.id === id);
    if (!tab || tab.pinned) return;
    inputRef.current?.flush();
    if (autoSave) { try { if (!await workspace.save(tab.id)) return; } catch (cause) { notify(historyError(cause, language === 'zh'), true); return; } }
    else {
      await tab.session.settled().catch(() => {});
      if (tab.session.snapshot().dirty && !window.confirm(language === 'zh' ? '此标签有未保存的修改，仍要关闭？' : 'Close this tab and discard unsaved changes?')) return;
    }
    if (id === workspace.snapshot().activeId) prepareTabChange();
    workspace.remove(id);
  }
  async function openRecord(entry: HistoryEntry, pinned = false) {
    const existing = workspace.snapshot().tabs.find(tab => tab.session.snapshot().draft?.entry?.id === entry.id);
    if (existing) { if (pinned) workspace.pin(existing.id, true); selectTab(existing.id); return; }
    const record = await historyStore.read(entry.id);
    if (!record) throw new HistoryConflict();
    const { source, ...metadata } = record;
    openDocument({ source, title: metadata.title, fileName: metadata.fileName, jsonc: metadata.jsonc, entry: metadata }, false, pinned);
  }
  async function updateRecord(entry: HistoryEntry, patch: { fileName?: string; pinned?: number }) {
    await workspace.withRecord(entry.id, async tab => {
      const previous = tab?.session.snapshot().draft?.entry ?? entry;
      const saved = await historyStore.save({ ...previous, ...patch }, previous);
      tab?.session.syncEntry(saved);
    });
  }
  async function removeRecord(entry: HistoryEntry) {
    await workspace.withRecord(entry.id, async tab => {
      await historyStore.remove(tab?.session.snapshot().draft?.entry ?? entry);
      if (tab) { if (tab.id === active.id) prepareTabChange(); workspace.remove(tab.id, true); }
    });
  }
  async function openHistory() {
    inputRef.current?.flush();
    if (autoSave) { try { await workspace.save(active.id); } catch { /* Keep history accessible so storage can be freed. */ } }
    setCommandOpen(false);
    setHistoryOpen(true);
  }
  const commands = [
    command('palette', language === 'zh' ? '命令面板' : 'Command palette', () => setCommandOpen(previous => !previous)),
    command('history', language === 'zh' ? '历史记录' : 'History', () => openHistory()),
    command('newHistory', language === 'zh' ? '新建标签页' : 'New tab', () => openDocument()),
    command('saveHistory', language === 'zh' ? '保存记录' : 'Save record', () => { void saveDocument(); }),
    command('format', t.format, () => activeEditor(inputRef.current)?.format(), view === 'diff' ? transform.busy : invalidOrBusy),
    command('repair', t.autoFix, autoFix, transform.busy),
    command('validate', t.validate, validateSource, parsed.pending),
    command('minify', t.minify, minifySource, invalidOrBusy),
    command('mask', language === 'zh' ? '数据脱敏' : 'Mask sensitive data', maskSource, invalidOrBusy),
    command('search', language === 'zh' ? '查找替换' : 'Find and replace', () => { if (view === 'diff') activeEditor(inputRef.current)?.search(); else { setView('code'); requestAnimationFrame(() => inputRef.current?.search()); } }),
    command('open', t.open, () => fileInput.current?.click()),
    command('url', language === 'zh' ? '从 URL / cURL 导入' : 'Import URL / cURL', () => setRemoteOpen(true)),
    command('copy', language === 'zh' ? '复制美化 JSON' : 'Copy formatted JSON', copyFormatted, invalidOrBusy),
    command('copyRaw', copied ? t.copied : t.copy, () => { void copySource(); }),
    command('export', t.export, download),
    command('undo', t.undo, () => activeEditor(inputRef.current)?.undo(), !historyState.undo),
    command('redo', t.redo, () => activeEditor(inputRef.current)?.redo(), !historyState.redo),
    command('unescape', t.unescape, unescapeSource, transform.busy),
    command('escape', t.escape, () => transform.run('escape', result => { if (result.ok) applyTransform(result.source); }), transform.busy),
    ...viewTabs.map(id => command(id, viewLabels[id], () => setView(id))),
    command('install', language === 'zh' ? '安装离线应用' : 'Install offline app', () => { void install.install(); }, !install.available),
    command('shortcuts', language === 'zh' ? '快捷键设置' : 'Keyboard shortcuts', () => setShortcutsOpen(true)),
  ];
  const commandsById = Object.fromEntries(commands.map(item => [item.id, item])) as Record<CommandId, PaletteCommand>;
  useCommandKeyboard(commands.map(item => ({ ...item, run: () => { if (item.id !== 'palette') setCommandOpen(false); item.run(); } })), () => activeEditor(inputRef.current)?.flush());
  const notification = notice && <div className={`action-notice ${notice.error ? 'notice-error' : ''}`} role="status">{notice.text}</div>;

  return (
    <div className="app-shell" data-theme={theme} data-palette={palette}>
      <header className="topbar">
        <a className="brand" href="#workspace" aria-label="JsonSage home">
          <span className="brand-mark"><img src="/jsonsage-mark.svg" alt="" /></span>
          <span>jsonsage</span>
        </a>
        <div className="topbar-right">
          <HelpTooltip side="bottom" label={language === 'zh' ? '命令使用指南' : 'Command guide'}><button className="header-control" data-tone="blue" onClick={() => setGuideOpen(true)}><BookOpen size={16} /><span>{language === 'zh' ? '文档' : 'Docs'}</span></button></HelpTooltip>
          <HelpTooltip side="bottom" label="GitHub"><a className="header-control repo-link" href="https://github.com/zhanpoint/jsonsage" target="_blank" rel="noopener noreferrer" aria-label="GitHub"><Github size={16} /><span>GitHub</span></a></HelpTooltip>
          <HelpTooltip side="bottom" label={`${commandsById.palette.label} · ${shortcutLabel(shortcuts.bindings.palette)}`}><button className="header-control command-trigger" data-tone="violet" onClick={() => setCommandOpen(true)} aria-label={commandsById.palette.label}><Command size={16} /><span>{language === 'zh' ? '命令' : 'Commands'}</span></button></HelpTooltip>
          {install.available && <HelpTooltip side="bottom" label={commandsById.install.label}><button className="header-control" onClick={() => void install.install()} aria-label={commandsById.install.label}><MonitorDown size={16} /><span>{language === 'zh' ? '安装' : 'Install'}</span></button></HelpTooltip>}
          <EditorSettings language={language} indent={indent} onIndentChange={setIndent} autoSave={autoSave} onAutoSaveChange={setAutoSave} onShortcuts={() => setShortcutsOpen(true)} />
          <div className="language-picker" ref={languagePickerRef}>
            <HelpTooltip side="bottom" label={t.language}>
            <button
              ref={languageButtonRef}
              type="button"
              className="header-control language-trigger"
              data-tone="cyan"
              aria-label={t.language}
              aria-expanded={languageOpen}
              aria-controls={languageOpen ? 'language-options' : undefined}
              onClick={() => { setPaletteOpen(false); setLanguageOpen((open) => !open); }}
            >
              <Globe2 size={16} aria-hidden="true" />
              <span>{language === 'zh' ? '中文' : 'EN'}</span>
              <ChevronDown size={14} className="language-chevron" aria-hidden="true" />
            </button>
            </HelpTooltip>
            {languageOpen && <div id="language-options" className="language-options">
              {(['zh', 'en'] as const).map((option) => <button
                key={option}
                type="button"
                className="language-option"
                aria-pressed={language === option}
                onClick={() => { setLanguage(option); setLanguageOpen(false); languageButtonRef.current?.focus(); }}
              >
                <span>{option === 'zh' ? '简体中文' : 'English'}</span>
                {language === option && <Check size={15} aria-hidden="true" />}
              </button>)}
            </div>}
          </div>
          <HelpTooltip side="bottom" label={theme === 'light' ? t.theme : t.lightTheme}><button
            type="button"
            className="header-control theme-toggle"
            data-tone={theme === 'dark' ? 'blue' : 'amber'}
            aria-label={theme === 'light' ? t.theme : t.lightTheme}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            <Moon size={18} className="theme-moon" aria-hidden="true" />
            <Sun size={18} className="theme-sun" aria-hidden="true" />
            <span>{theme === 'dark' ? (language === 'zh' ? '深色' : 'Dark') : (language === 'zh' ? '浅色' : 'Light')}</span>
          </button></HelpTooltip>
          <div className="palette-picker" ref={palettePickerRef}>
            <HelpTooltip side="bottom" label={t.palette}>
            <button
              ref={paletteButtonRef}
              type="button"
              className="header-control palette-trigger"
              data-tone="violet"
              aria-label={t.palette}
              aria-expanded={paletteOpen}
              aria-controls={paletteOpen ? 'palette-options' : undefined}
              onClick={() => { setLanguageOpen(false); setPaletteOpen((open) => !open); }}
            >
              <Palette size={18} aria-hidden="true" />
              <span>{language === 'zh' ? '配色' : 'Colors'}</span>
            </button>
            </HelpTooltip>
            {paletteOpen && <div id="palette-options" className="palette-options">
              <span className="palette-heading">{t.palette}</span>
              {palettes.map((item) => <button
                key={item.id}
                type="button"
                className="palette-option"
                aria-pressed={palette === item.id}
                onClick={() => { setPalette(item.id); setPaletteOpen(false); paletteButtonRef.current?.focus(); }}
              >
                <span className="palette-swatch" style={{ backgroundColor: item.swatch }} aria-hidden="true" />
                <span>{language === 'zh' ? item.zh : item.en}</span>
                {palette === item.id && <Check size={15} aria-hidden="true" />}
              </button>)}
            </div>}
          </div>
        </div>
      </header>

      {pathMenu && <PathMenu target={pathMenu} language={language} onPreview={() => openTextPreview(pathMenu.path)} onClose={() => setPathMenu(null)} onCopy={async path => { try { await navigator.clipboard.writeText(path); setNotice('copied'); } catch { setNotice('copyFailed'); } }} />}
      {remoteOpen && <Suspense fallback={null}><RemoteImport language={language} onClose={() => setRemoteOpen(false)} onLoad={text => openDocument(newHistoryDraft({ source: text.replace(/\r\n?/g, '\n'), fileName: 'import.json', jsonc: false }), true)} /></Suspense>}
      <main id="workspace" className="workspace">
        <div className="reading-workspace">
        <section className={`editor-card${dragging ? ' is-dragging' : ''}`} aria-label={t.editor}
          onPointerDownCapture={event => { if (!(event.target as HTMLElement).closest('.cm-editor')) activeEditor(inputRef.current)?.flush(); }}
          onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
          onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); setDragging(false); void loadFile(event.dataTransfer.files[0]); } }}>
          {dragging && <div className="drop-hint">{language === 'zh' ? '松开以导入 JSON 文件' : 'Drop to import JSON'}</div>}
          <DocumentTabs tabs={documents.tabs} activeId={active.id} language={language} onSelect={selectTab} onClose={id => { void closeTab(id); }} onPin={workspace.pin} onRename={renameTab} onNew={() => openDocument()} onSave={() => { void saveDocument(); }} newShortcut={shortcutLabel(shortcuts.bindings.newHistory)} saveShortcut={shortcutLabel(shortcuts.bindings.saveHistory)} history={<HistoryMenu open={historyOpen} onOpenChange={open => { if (open) void openHistory(); else setHistoryOpen(false); }} language={language} shortcut={shortcutLabel(shortcuts.bindings.history)} activeRecord={documentHistory.draft?.entry?.id} fixedRecords={new Set(documents.tabs.flatMap(tab => { const entry = tab.session.snapshot().draft?.entry; return tab.pinned && entry ? [entry.id] : []; }))} onSelect={openRecord} onUpdate={updateRecord} onRemove={removeRecord} onUnfix={entry => { const tab = documents.tabs.find(tab => tab.session.snapshot().draft?.entry?.id === entry.id); if (tab) workspace.pin(tab.id, false); }} onError={(cause, operation) => notify(historyError(cause, language === 'zh', operation), true)} />}>
          <div className="editor-toolbar">
            <div className="view-tabs" role="group" aria-label={language === 'zh' ? '数据视图' : 'Data views'}>
              {viewTabs.map(mode => {
                const item = commandsById[mode];
                return <button key={mode} className={mode === 'diff' ? 'view-group-start' : undefined} data-tone={item.tone} aria-pressed={view === mode} onClick={item.run} title={shortcutLabel(item.binding)}><item.icon size={14} aria-hidden="true" />{item.label}</button>;
              })}
              {importing && <span role="status">{language === 'zh' ? '正在导入…' : 'Importing…'}</span>}

            </div>
            <div className="toolbar-actions">
              <HelpTooltip label={t.mode}><label className="mode-switch">
                <input type="checkbox" checked={jsonc} onChange={(event) => { setJsonc(event.target.checked); setNotice(null); }} aria-label="JSONC" />
                <span className="switch-track" aria-hidden="true" />
                <span className="mode-label">JSONC</span>
              </label></HelpTooltip>
              <span className="toolbar-separator" />
              {(['validate', 'repair', 'mask', 'format', 'minify', 'escape', 'unescape'] as const).map(id => <CommandButton key={id} command={commandsById[id]} />)}
              <span className="toolbar-separator" />
              {(['undo', 'redo', 'search', 'copyRaw', 'copy', 'open', 'url', 'export'] as const).map(id => <CommandButton key={id} command={commandsById[id]} />)}
              <span className="toolbar-separator" />
              <HelpTooltip label={language === 'zh' ? '侧边预览' : 'Side preview'}><button className="tool-button" aria-label={language === 'zh' ? '侧边预览' : 'Side preview'} data-tone="violet" aria-pressed={!!textPreview} onClick={() => setTextPreview(previous => previous ? null : { path: cursor.path })}><PanelRight size={16} /></button></HelpTooltip>
              <input hidden ref={fileInput} type="file" accept=".json,.jsonc,.jsonl,.ndjson,application/json,application/jsonl,application/x-ndjson,text/plain" onChange={event => { void loadFile(event.target.files?.[0]); event.target.value = ''; }} />
            </div>
          </div>
          <EditorViewport language={language}>
          <PreviewWorkspace language={language} preview={textPreview && <Suspense fallback={<div className="view-message">{language === 'zh' ? '正在加载预览…' : 'Loading preview…'}</div>}><TextPreview source={source} path={textPreview.path} language={language} onClose={() => setTextPreview(null)} /></Suspense>}>
              {(view === 'code' || view === 'tree') && <div className="editor-fold-actions">
                <HelpTooltip label={language === 'zh' ? '全部展开' : 'Expand all'}><button type="button" className="tool-button" aria-label={language === 'zh' ? '全部展开' : 'Expand all'} onClick={() => foldViews(false)}><ChevronsDown size={15} /></button></HelpTooltip>
                <HelpTooltip label={language === 'zh' ? '全部折叠' : 'Collapse all'}><button type="button" className="tool-button" aria-label={language === 'zh' ? '全部折叠' : 'Collapse all'} onClick={() => foldViews(true)}><ChevronsUp size={15} /></button></HelpTooltip>
              </div>}
          <Suspense fallback={<div className="view-message">{language === 'zh' ? '正在加载视图…' : 'Loading view…'}</div>}>
            <div hidden={view !== 'code' && view !== 'tree'} className={view === 'tree' ? 'code-view linked-editors' : 'code-view'}>
              <CodeEditor folds={parsed.folds} documentId={active.id} documentIds={documentIds} readOnly={!documents.ready} managedFormat language={language} onHistory={syncHistory} source={source} indent={indent} theme={theme} diagnostics={diagnostics} label={t.source} editorRef={inputRef} onChange={updateSource} onPendingChange={pending => { setEditorDirty(pending); if (pending) { fileLoadSequence.current++; transform.cancel(); } }} onFormat={formatSource} onRepair={autoFix} onCursor={cursor.select} onPaste={smartPaste} onContextPath={(event, offset) => { event.preventDefault(); cursor.resolve(offset, path => openPathMenu(event, path)); }} />
              {view === 'tree' && <DataView {...dataViewProps} view="tree" onSelect={(node, path, focus) => { cursor.set(path); inputRef.current?.locate(node.offset, node.offset + node.length, focus); }} onLocate={(start, end) => inputRef.current?.locate(start, end)} />}
            </div>
          </Suspense>
          {(view === 'table' || view === 'graph') && <DataView {...dataViewProps} view={view} onSelect={(_node, path) => cursor.set(path)} onLocate={(start, end) => { setView('code'); requestAnimationFrame(() => inputRef.current?.locate(start, end)); }} />}
          <Suspense fallback={<div className="view-message">{language === 'zh' ? '正在加载工具…' : 'Loading…'}</div>}>
            {(view === 'diff' || view === 'types') && <AnalysisTools key={active.id} mode={view} other={compareSource} onOtherChange={setCompareSource} source={source} onChange={updateSource} language={language} theme={theme} indent={indent} jsonc={jsonc} onNotice={notify} onHistory={syncHistory} />}
          </Suspense>
          </PreviewWorkspace>
          </EditorViewport>
          <div className="editor-footer" id="editor-help">
            <span className="save-status" role="status" data-error={!!documentHistory.error}>{documentHistory.error ? (language === 'zh' ? '未保存' : 'Not saved') : documentHistory.saving ? (language === 'zh' ? '正在保存…' : 'Saving…') : documentHistory.dirty || editorDirty ? (autoSave ? (language === 'zh' ? '等待保存' : 'Waiting to save') : (language === 'zh' ? '未保存' : 'Unsaved')) : documentHistory.draft?.entry ? (language === 'zh' ? '已保存' : 'Saved') : (autoSave ? (language === 'zh' ? '自动保存' : 'Auto-save') : (language === 'zh' ? '手动保存' : 'Manual save'))}</span>
            <div className="footer-left"><span><Code2 size={13} /> {t.utf8}</span><span>{lineCount} {t.lines}</span><span>{characterCount?.toLocaleString() ?? '…'} {t.chars}</span></div>
            <PathBreadcrumbs path={cursor.path} root={root} language={language} onCopy={() => { void navigator.clipboard.writeText(pathText(cursor.path)).then(() => setNotice('copied'), () => setNotice('copyFailed')); }} />
          </div>
          </DocumentTabs>
        </section>

        </div>

        {notification}
        {guideOpen && <Suspense fallback={null}><CommandGuide language={language} commands={commands} onClose={() => setGuideOpen(false)} /></Suspense>}
        {commandOpen && <Suspense fallback={null}><CommandPalette language={language} commands={commands.filter(item => item.id !== 'palette')} onClose={() => setCommandOpen(false)} /></Suspense>}
        {shortcutsOpen && <Suspense fallback={null}><ShortcutSettings language={language} commands={commands} bindings={shortcuts.bindings} onChange={shortcuts.setBindings} onClose={() => setShortcutsOpen(false)} /></Suspense>}
        <section className="details-card">
          <div className="details-heading">
            <div className="issues-heading"><CircleAlert size={15} /> {t.issuesTab} <span className="tab-count">{errors.length + warnings.length}</span></div>
          </div>
          {parsed.pending ? <div className="view-caption" role="status">{language === 'zh' ? '正在后台检查语法…' : 'Checking syntax in the background…'}</div> : parsed.diagnostics.length ? (
              <div className="issues-list">
                {diagnostics.map((diagnostic: JsonDiagnostic, index: number) => {
                  const loc = diagnostic.location ?? position(source, diagnostic.start);
                  return <button type="button" className="issue-row" onClick={() => locateIssue(diagnostic)} key={`${diagnostic.code}-${diagnostic.start}-${index}`}>
                    <div className={`issue-icon ${diagnostic.severity}`}><CircleAlert size={15} /></div>
                    <div className="issue-content"><div className="issue-title">{diagnostic.message}</div>{diagnostic.hint && <p>{diagnostic.hint}</p>}</div>
                    <span className={`issue-code ${diagnostic.severity}`}>{diagnostic.code}</span>
                    <span className="issue-location">{language === 'zh' ? `${t.lineShort}${loc.line}行，第${loc.column}${t.columnShort}` : `${t.lineShort} ${loc.line}, ${t.columnShort} ${loc.column}`}</span>
                  </button>;
                })}
              </div>
            ) : <div className="empty-state"><span className="empty-icon"><Check size={19} /></span><strong>{t.good}</strong></div>
          }
          <footer className="details-footer">
            <span>{errors.length} {t.errors} <i /> {warnings.length} {t.warnings}</span>
          </footer>
        </section>
        <footer className="page-footer">
          <span className="privacy-note"><span className="privacy-lock">✳</span> {t.privacy}</span>
          <a href="https://json.org" target="_blank" rel="noopener noreferrer">{t.jsonGuide}</a>
        </footer>
      </main>
    </div>
  );
}
