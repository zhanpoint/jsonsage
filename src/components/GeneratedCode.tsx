import { useEffect, useRef, useState } from 'react';
import { Copy, Download } from 'lucide-react';
import CodeEditor, { type EditorHandle } from './CodeEditor';
import type { CodeLanguage } from '../lib/codeLanguages';
import type { JsonDiagnostic } from '../lib/json/engine';
import type { Indent } from '../lib/json/transforms';

const noop = () => {};
export default function GeneratedCode({ source: initial, format, language, theme, indent, onNotice }: {
  source: string; format: CodeLanguage; language: 'zh' | 'en'; theme: 'light' | 'dark'; indent: Indent; onNotice: (message: string) => void;
}) {
  const [source, setSource] = useState(initial);
  const [diagnostics, setDiagnostics] = useState<JsonDiagnostic[]>([]);
  const [error, setError] = useState('');
  const editor = useRef<EditorHandle | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const sequence = useRef(0);
  const zh = language === 'zh';
  useEffect(() => {
    try {
      const worker = new Worker(new URL('../workers/codeDiagnostics.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<{ id: number; diagnostics?: JsonDiagnostic[]; error?: string }>) => {
        if (event.data.id !== sequence.current) return;
        setDiagnostics(event.data.diagnostics ?? []); setError(event.data.error ?? '');
      };
      worker.onerror = () => { setError('CHECKER_UNAVAILABLE'); worker.terminate(); workerRef.current = null; };
      return () => { worker.terminate(); workerRef.current = null; };
    } catch (cause) { setError(String(cause)); }
  }, []);
  useEffect(() => {
    const id = ++sequence.current;
    if (!workerRef.current) return;
    setDiagnostics([]); setError('');
    const timer = setTimeout(() => {
      workerRef.current?.postMessage({ id, source, language: format });
    }, 300);
    return () => clearTimeout(timer);
  }, [source, format]);
  async function copy() {
    try { await navigator.clipboard.writeText(source); onNotice(zh ? '已复制' : 'Copied'); }
    catch { onNotice(zh ? '复制失败，请检查剪贴板权限。' : 'Clipboard permission required.'); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `result.${{ typescript: 'ts', python: 'py', go: 'go', rust: 'rs' }[format]}`;
    link.click(); URL.revokeObjectURL(url);
  }
  return <>
    <div className="analysis-toolbar output-toolbar"><button onClick={() => void copy()}><Copy size={14} />{zh ? '复制' : 'Copy'}</button><button onClick={download}><Download size={14} />{zh ? '导出' : 'Export'}</button></div>
    {error && <p className="analysis-message error" role="alert">{error === 'CHECKER_UNAVAILABLE' ? (zh ? '检查器加载失败' : 'Unable to load checker') : error}</p>}
    <CodeEditor source={source} onChange={setSource} codeLanguage={format} diagnostics={diagnostics} language={language} theme={theme} indent={indent} editorRef={editor} label={zh ? '生成代码' : 'Generated code'} onHistory={noop} onFormat={noop} onContextPath={noop} managedFormat />
  </>;
}
