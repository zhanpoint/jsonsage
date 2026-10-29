import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Annotation, Compartment, EditorState, type StateEffect } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { json } from '@codemirror/lang-json';
import { codeLanguage, type CodeLanguage } from '../lib/codeLanguages';
import { bracketMatching, foldAll, foldEffect, foldKeymap, foldedRanges, indentOnInput, indentUnit, unfoldAll, unfoldEffect } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, undoDepth, redoDepth, isolateHistory } from '@codemirror/commands';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { search, searchKeymap, openSearchPanel, closeSearchPanel, searchPanelOpen } from '@codemirror/search';
import { createSearchPanel, openReplacePanel } from '../lib/searchPanel';
import type { JsonDiagnostic } from '../lib/json/engine';
import { indentationOptions, type Indent } from '../lib/json/transforms';
import { editorTheme, chineseEditorPhrases } from '../lib/editorTheme';
import { diffHighlights, setDiffHighlights } from '../lib/diffHighlights';
import type { DiffHighlight } from '../lib/json/analysis';
import { documentChange, editorDiagnostics, registerEditor, type EditorHandle, type HistoryState } from '../lib/codeEditor';
import { smartCandidate } from '../lib/json/smartInput';
import { LARGE_DOCUMENT, largeJsonLanguage, setFoldIndex, foldIndex } from '../lib/largeJsonLanguage';
import { inlineFolding } from '../lib/inlineFolding';
import { editorLinks } from '../lib/editorLinks';
import { documentSizeLimit, exceedsDocumentLimit, MAX_DOCUMENT_CHARACTERS } from '../lib/documentLimits';
import DocumentLimitDialog from './DocumentLimitDialog';

export type { EditorHandle, HistoryState } from '../lib/codeEditor';
type Props = {
  codeLanguage?: CodeLanguage;
  folds?: Uint32Array | null;
  documentId?: string; documentIds?: readonly string[];
  managedFormat?: boolean;
  highlights?: DiffHighlight[];
  readOnly?: boolean; onCursor?: (offset: number, pending?: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  onPaste?: (text: string, insert: (text: string) => boolean) => void; onRepair?: () => void;
  source: string; onChange: (source: string) => void; onFormat: () => void; onContextPath: (event: MouseEvent, offset: number) => void;
  language: 'zh' | 'en'; onHistory: (state: HistoryState, editor: EditorHandle) => void;
  indent: Indent; theme: 'light' | 'dark'; diagnostics: JsonDiagnostic[];
  editorRef: RefObject<EditorHandle | null>; label: string;
};
const externalChange = Annotation.define<boolean>();
function indentation(indent: Indent) {
  const { tabSize, insertSpaces } = indentationOptions(indent);
  return [EditorState.tabSize.of(tabSize), indentUnit.of(insertSpaces ? ' '.repeat(tabSize) : '\t')];
}

export default function CodeEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(props); latest.current = props;
  const source = useRef(props.source);
  const pendingSnapshot = useRef(false);
  const [documentRevision, setDocumentRevision] = useState(0);
  const [sizeLimitOpen, setSizeLimitOpen] = useState(false);
  const compartments = useRef({ indent: new Compartment(), theme: new Compartment(), label: new Compartment(), syntax: new Compartment(), readOnly: new Compartment() });
  const switchDocument = useRef<((props: Props) => void) | null>(null);
  const documents = useRef(new Map<string, { state: EditorState; source: string; top: number; left: number }>());

  useLayoutEffect(() => {
    const initial = latest.current;
    const config = compartments.current;
    let historyState: HistoryState = { undo: false, redo: false };
    source.current = initial.source;
    let snapshotTimer: ReturnType<typeof setTimeout> | undefined;
    const flush = (target = latest.current) => {
      clearTimeout(snapshotTimer);
      if (!pendingSnapshot.current) return;
      pendingSnapshot.current = false;
      source.current = instance.state.doc.toString();
      setDocumentRevision(revision => revision + 1);
      target.onChange(source.current);
      target.onPendingChange?.(false);
      target.onCursor?.(instance.state.selection.main.head);
    };
    const format = () => { flush(); requestAnimationFrame(() => latest.current.onFormat()); return true; };
    const createState = (document: Props) => EditorState.create({
        doc: document.source,
        extensions: [
          documentSizeLimit(() => setSizeLimitOpen(true)),
          config.syntax.of(document.codeLanguage ? codeLanguage(document.codeLanguage) : document.source.length > LARGE_DOCUMENT ? largeJsonLanguage : json()), diffHighlights, lintGutter(), lineNumbers(), inlineFolding, bracketMatching(), indentOnInput(),
          drawSelection(), highlightActiveLine(), highlightActiveLineGutter(), editorLinks,
          history(), search({ top: true, createPanel: createSearchPanel }),
          config.readOnly.of([EditorState.readOnly.of(!!initial.readOnly), EditorView.editable.of(!initial.readOnly)]),
          config.indent.of(indentation(initial.indent)), config.theme.of(editorTheme(initial.theme === 'dark')),
          config.label.of([EditorView.contentAttributes.of({ 'aria-label': initial.label, 'aria-describedby': 'editor-help' }), EditorState.phrases.of(initial.language === 'zh' ? chineseEditorPhrases : {})]),
          keymap.of([
            ...(!initial.managedFormat ? [{ key: 'Mod-Enter', run: format }] : []),
            { key: 'Mod-h', run: openReplacePanel, scope: 'editor search-panel', preventDefault: true },
            indentWithTab, ...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap,
          ]),
          EditorView.updateListener.of(update => {
            if (update.selectionSet || update.docChanged) latest.current.onCursor?.(update.state.selection.main.head, update.docChanged);
            if (update.docChanged && !update.transactions.some(transaction => transaction.annotation(externalChange))) {
              if (update.state.doc.length > LARGE_DOCUMENT) {
                if (!pendingSnapshot.current) { pendingSnapshot.current = true; latest.current.onPendingChange?.(true); }
                clearTimeout(snapshotTimer); snapshotTimer = setTimeout(flush, 300);
              } else {
                clearTimeout(snapshotTimer); pendingSnapshot.current = false;
                source.current = update.state.doc.toString(); latest.current.onChange(source.current); latest.current.onPendingChange?.(false);
              }
            } else if (update.docChanged) {
              clearTimeout(snapshotTimer); pendingSnapshot.current = false; latest.current.onPendingChange?.(false);
            }
            const next = { undo: undoDepth(update.state) > 0, redo: redoDepth(update.state) > 0 };
            if (next.undo !== historyState.undo || next.redo !== historyState.redo) {
              historyState = next; if (initial.editorRef.current) latest.current.onHistory(next, initial.editorRef.current);
            }
          }),
          EditorView.domEventHandlers({ blur() { flush(); return false; }, paste(event, editor) {
            const text = event.clipboardData?.getData('text/plain');
            if (!text) return false;
            const selection = editor.state.selection.main;
            if (text.length > MAX_DOCUMENT_CHARACTERS || (editor.state.selection.ranges.length === 1 && exceedsDocumentLimit(editor.state.doc.length, editor.state.doc.length - (selection.to - selection.from) + text.length))) {
              event.preventDefault(); setSizeLimitOpen(true); return true;
            }
            if (!latest.current.onPaste || !smartCandidate(text)) return false;
            const pasted = editor.state.toText(text);
            const end = selection.from + pasted.length;
            event.preventDefault();
            editor.dispatch({ changes: { from: selection.from, to: selection.to, insert: pasted }, selection: { anchor: end }, userEvent: 'input.paste' });
            const document = editor.state.doc;
            latest.current.onPaste(text, next => {
              if (editor.state.doc !== document || editor.state.selection.main.head !== end) return false;
              const decoded = editor.state.toText(next);
              editor.dispatch({ changes: { from: selection.from, to: end, insert: decoded }, selection: { anchor: selection.from + decoded.length }, userEvent: 'input.paste' });
              return true;
            });
            return true;
          }, contextmenu(event, editor) {
            const offset = editor.posAtCoords({ x: event.clientX, y: event.clientY });
            if (offset !== null) latest.current.onContextPath(event, offset);
            return event.defaultPrevented;
          } }),
        ],
      });
    const instance = new EditorView({ parent: host.current!, state: createState(initial) });
    view.current = instance;
    const handle: EditorHandle = {
      flush, format,
      setFolded(folded) {
        if (!folded) { unfoldAll(instance); return; }
        const ranges = latest.current.folds ?? instance.state.field(foldIndex, false);
        if (!ranges) { foldAll(instance); return; }
        const effects: StateEffect<unknown>[] = [];
        let end = -1;
        for (let i = 0; i < ranges.length; i += 2) {
          const from = ranges[i], to = ranges[i + 1];
          if (from >= end && to > from) { effects.push(foldEffect.of({ from, to })); end = to; }
        }
        instance.dispatch({ effects });
      },
      history: () => latest.current.readOnly ? { undo: false, redo: false } : { undo: undoDepth(instance.state) > 0, redo: redoDepth(instance.state) > 0 },
      undo: () => { undo(instance); }, redo: () => { redo(instance); }, search: () => { (searchPanelOpen(instance.state) ? closeSearchPanel : openSearchPanel)(instance); },
      locate(start, end, focus = true) {
        const from = Math.max(0, Math.min(start, instance.state.doc.length));
        const to = Math.max(from, Math.min(end, instance.state.doc.length));
        const effects: StateEffect<unknown>[] = [];
        foldedRanges(instance.state).between(from, to, (a, b) => { effects.push(unfoldEffect.of({ from: a, to: b })); });
        effects.push(EditorView.scrollIntoView(from, { y: 'center' }));
        instance.dispatch({ selection: { anchor: from, head: to }, effects });
        if (focus) instance.focus();
      },
    };
    initial.editorRef.current = handle;
    const unregister = registerEditor(instance.dom, handle);
    const syncHistory = () => latest.current.onHistory(handle.history(), handle);
    instance.dom.addEventListener('focusin', syncHistory);
    initial.onHistory(handle.history(), handle);
    let current = initial;
    switchDocument.current = next => {
      if (next.documentId === current.documentId) { current = next; return; }
      flush(current);
      if (current.documentId) documents.current.set(current.documentId, { state: instance.state, source: source.current, top: instance.scrollDOM.scrollTop, left: instance.scrollDOM.scrollLeft });
      const cached = next.documentId ? documents.current.get(next.documentId) : undefined;
      if (next.documentId) documents.current.delete(next.documentId);
      instance.setState(cached?.state ?? createState(next));
      source.current = cached?.source ?? next.source;
      current = next;
      historyState = handle.history();
      next.onHistory(historyState, handle);
      next.onPendingChange?.(false);
      next.onCursor?.(instance.state.selection.main.head);
      instance.requestMeasure({ read: () => null, write() {
        if (current.documentId !== next.documentId) return;
        instance.scrollDOM.scrollTop = cached?.top ?? 0;
        instance.scrollDOM.scrollLeft = cached?.left ?? 0;
      } });
    };
    return () => {
      clearTimeout(snapshotTimer);
      initial.editorRef.current = null;
      view.current = null;
      switchDocument.current = null; documents.current.clear();
      instance.dom.removeEventListener('focusin', syncHistory); unregister();
      instance.destroy();
    };
  }, []);
  useLayoutEffect(() => { switchDocument.current?.(props); });
  useEffect(() => {
    if (props.documentIds) for (const id of documents.current.keys()) if (!props.documentIds.includes(id)) documents.current.delete(id);
  }, [props.documentIds]);

  useEffect(() => {
    const instance = view.current;
    if (!instance || source.current === props.source) return;
    // A pending large-document snapshot may be older than the live CM6 document.
    const changes = documentChange(instance.state.doc.toString(), props.source);
    source.current = props.source;
    instance.dispatch({ changes, annotations: [externalChange.of(true), isolateHistory.of('full')], userEvent: 'input.external' });
  }, [props.source, props.documentId]);
  useEffect(() => {
    const instance = view.current;
    if (instance) instance.dispatch(setDiagnostics(instance.state, editorDiagnostics(props.diagnostics, instance.state.doc.length).map(diagnostic => {
      const line = instance.state.doc.lineAt(diagnostic.from);
      return { ...diagnostic, message: `${props.language === 'zh' ? `第 ${line.number} 行，第 ${diagnostic.from - line.from + 1} 列` : `Line ${line.number}, Col ${diagnostic.from - line.from + 1}`} · ${diagnostic.message}`,
        actions: props.onRepair && diagnostic.severity === 'error' ? [{ name: props.language === 'zh' ? '自动修复' : 'Auto-Fix', apply: () => latest.current.onRepair?.() }] : undefined };
    })));
  }, [props.diagnostics, props.source, props.language, props.documentId]);
  const large = !props.codeLanguage && props.source.length > LARGE_DOCUMENT;
  useEffect(() => { view.current?.dispatch({ effects: compartments.current.syntax.reconfigure(props.codeLanguage ? codeLanguage(props.codeLanguage) : large ? largeJsonLanguage : json()) }); }, [large, props.codeLanguage, props.documentId]);
  useEffect(() => {
    const instance = view.current;
    if (!large || !instance) return;
    // The primary editor shares validation's index; auxiliary editors build their own.
    if (props.folds !== undefined) {
      if (props.folds && !pendingSnapshot.current) instance.dispatch({ effects: setFoldIndex.of(props.folds) });
      return;
    }
    const document = instance.state.doc;
    const worker = new Worker(new URL('../workers/folds.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Uint32Array>) => {
      if (view.current === instance && instance.state.doc === document) instance.dispatch({ effects: setFoldIndex.of(event.data) });
      worker.terminate();
    };
    worker.onerror = () => worker.terminate();
    worker.postMessage(props.source);
    return () => worker.terminate();
  }, [large, props.source, props.documentId, props.folds, documentRevision]);
  useEffect(() => { view.current?.dispatch({ effects: compartments.current.indent.reconfigure(indentation(props.indent)) }); }, [props.indent, props.documentId]);
  useEffect(() => { view.current?.dispatch({ effects: compartments.current.readOnly.reconfigure([EditorState.readOnly.of(!!props.readOnly), EditorView.editable.of(!props.readOnly)]) }); }, [props.readOnly, props.documentId]);
  useEffect(() => { view.current?.dispatch({ effects: compartments.current.theme.reconfigure(editorTheme(props.theme === 'dark')) }); }, [props.theme, props.documentId]);
  useEffect(() => { view.current?.dispatch({ effects: compartments.current.label.reconfigure([EditorView.contentAttributes.of({ 'aria-label': props.label, 'aria-describedby': 'editor-help' }), EditorState.phrases.of(props.language === 'zh' ? chineseEditorPhrases : {})]) }); }, [props.label, props.language, props.documentId]);
  useEffect(() => { view.current?.dispatch({ effects: setDiffHighlights.of(props.highlights ?? []) }); }, [props.highlights, props.documentId]);
  return <><div ref={host} className="code-editor-host" />{sizeLimitOpen && <DocumentLimitDialog kind="text" language={props.language} onClose={() => setSizeLimitOpen(false)} />}</>;
}
