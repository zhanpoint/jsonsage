import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GitCompareArrows, Square, FileCode2 } from 'lucide-react';
import CodeEditor, { type EditorHandle, type HistoryState } from './CodeEditor';
import { useAnalysis } from '../hooks/useAnalysis';
import { useJsonTransform } from '../hooks/useJsonTransform';
import type { Indent } from '../lib/json/transforms';
import type { JsonDiagnostic } from '../lib/json/engine';
import GeneratedCode from './GeneratedCode';
import { SelectField } from './ui/SelectField';
import { commandDefinitions } from '../lib/commands';

const noop = () => {};
const noDiagnostics: JsonDiagnostic[] = [];
const targetLanguages = [{ value: 'typescript', label: 'TypeScript' }, { value: 'python', label: 'Python' }, { value: 'go', label: 'Go' }, { value: 'rust', label: 'Rust' }] as const;

export default function AnalysisTools({ mode, source, onChange, other, onOtherChange: setOther, language, theme, indent, jsonc, onNotice, onHistory }: {
  other: string; onOtherChange: (value: string) => void;
  mode: 'diff' | 'types'; source: string; onChange: (value: string) => void; onNotice: (text: string) => void;
  language: 'zh' | 'en'; theme: 'light' | 'dark'; indent: Indent; jsonc: boolean;
  onHistory: (state: HistoryState, editor: EditorHandle) => void;
}) {
  const zh = language === 'zh';
  const [target, setTarget] = useState<'typescript' | 'python' | 'go' | 'rust'>('typescript');
  const left = useRef<EditorHandle | null>(null);
  const right = useRef<EditorHandle | null>(null);
  const analysis = useAnalysis();
  const leftTransform = useJsonTransform(source, indent, { mode: jsonc ? 'jsonc' : 'strict' });
  const rightTransform = useJsonTransform(other, indent, { mode: jsonc ? 'jsonc' : 'strict' });
  useEffect(() => { analysis.reset(); }, [source, other, mode, jsonc, target, indent, analysis.reset]);
  useEffect(() => { if (analysis.error) onNotice((zh ? '处理失败：' : 'Unable to process: ') + analysis.error.slice(0, 240)); }, [analysis.error, onNotice, zh]);
  const result = analysis.result;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({ count: result && result.kind !== 'output' ? result.rows.length : 0, getScrollElement: () => scrollRef.current, estimateSize: () => 66, overscan: 6 });
  const editorProps = { managedFormat: true, language, theme, indent, diagnostics: noDiagnostics, onHistory, onContextPath: noop };
  const run = () => analysis.run(mode === 'types' ? { kind: mode, source, jsonc, indent, target } : { kind: 'diff', source, other, jsonc });
  return <section className="analysis-tools" data-tone={commandDefinitions[mode].tone} aria-label={mode === 'types' ? (zh ? '类型生成' : 'Type generation') : 'JSON Diff'}>
    {mode === 'diff' && <div className="diff-editors">
      <div><header>{zh ? '原始 JSON' : 'Original JSON'}</header><CodeEditor {...editorProps} source={source} onChange={onChange} onPendingChange={pending => { if (pending) { leftTransform.cancel(); analysis.reset(); } }} onFormat={() => leftTransform.run('format', result => { if (result.ok) onChange(result.source); })} editorRef={left} label={zh ? '原始 JSON' : 'Original JSON'} highlights={result?.kind === 'diff' ? result.left : undefined} /></div>
      <div><header>{zh ? '对比 JSON' : 'Compared JSON'}</header><CodeEditor {...editorProps} source={other} onChange={setOther} onPendingChange={pending => { if (pending) { rightTransform.cancel(); analysis.reset(); } }} onFormat={() => rightTransform.run('format', result => { if (result.ok) setOther(result.source); })} editorRef={right} label={zh ? '对比 JSON' : 'Compared JSON'} highlights={result?.kind === 'diff' ? result.right : undefined} /></div>
    </div>}
    <form className="analysis-toolbar" onSubmit={event => { event.preventDefault(); run(); }}>
      {mode === 'types' ? <SelectField label={zh ? '目标语言' : 'Target language'} value={target} items={targetLanguages} onChange={setTarget} /> : <span className="diff-legend"><i className="diff-create" />{zh ? '新增' : 'Added'} <i className="diff-change" />{zh ? '修改' : 'Changed'} <i className="diff-type" />{zh ? '类型变更' : 'Type changed'} <i className="diff-remove" />{zh ? '删除' : 'Removed'}</span>}
      {analysis.busy ? <button type="button" onClick={analysis.cancel}><Square size={14} />{zh ? '取消' : 'Cancel'}</button> : <button type="submit">{mode === 'types' ? <FileCode2 size={14} /> : <GitCompareArrows size={14} />}{mode === 'diff' ? (zh ? '对比' : 'Compare') : (zh ? '运行' : 'Run')}</button>}
    </form>
    {analysis.busy && <p className="analysis-message" role="status">{zh ? '正在本地处理…' : 'Processing locally…'}</p>}
    {!result && !analysis.error && !analysis.busy && <p className="analysis-message">{mode === 'types' ? (zh ? '从当前 JSON 推断类型，生成后请核对业务约束。' : 'Infer types from the current JSON; review your domain constraints.') : (zh ? '按字段和值对比，忽略对象键的排列顺序；数组按索引比较。' : 'Compare fields and values, ignoring object key order. Arrays compare by index.')}</p>}
    {result?.kind === 'output' && <GeneratedCode source={result.source} format={result.format} language={language} theme={theme} indent={indent} onNotice={onNotice} />}
    {result && result.kind !== 'output' && <>
      <p className="analysis-message" role="status">{`${result.total} ${zh ? '处差异' : 'differences'}`}{(result.total > result.rows.length) && (zh ? ' · 仅展示前 5,000 项，请缩小范围。' : ' · Showing the first 5,000 entries.')}</p>
      {!!result.rows.length && <div ref={scrollRef} className="analysis-results" aria-label={zh ? '分析结果' : 'Analysis results'}>
        <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
          {virtual.getVirtualItems().map(item => {
            const row = result.rows[item.index];
            return <div className="analysis-row" key={item.index} style={{ height: item.size, transform: `translateY(${item.start}px)` }}>
              <code className="analysis-path" title={row.path}>{row.path}</code>
              <div className="diff-values"><code className={row.kind !== 'CREATE' ? `diff-${row.kind.toLowerCase()}` : ''} title={row.before}>{row.before}</code><code className={row.kind !== 'REMOVE' ? `diff-${row.kind.toLowerCase()}` : ''} title={row.after}>{row.after}</code></div>
            </div>;
          })}
        </div>
      </div>}
    </>}
  </section>;
}
