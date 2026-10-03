import { useEffect, useRef, type RefObject } from 'react';
import { Annotation, Compartment, EditorState, type StateEffect } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { json } from '@codemirror/lang-json';
import { bracketMatching, foldGutter, foldKeymap, foldedRanges, indentOnInput, indentUnit, unfoldEffect } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, undoDepth, redoDepth, isolateHistory } from '@codemirror/commands';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import type { JsonDiagnostic } from '../lib/json/engine';
import { indentationOptions, type Indent } from '../lib/json/transforms';
import { editorTheme, chineseEditorPhrases } from '../lib/editorTheme';
import { diffHighlights, setDiffHighlights } from '../lib/diffHighlights';
import type { DiffHighlight } from '../lib/json/analysis';
import { documentChange, editorDiagnostics, registerEditor, type EditorHandle, type HistoryState } from '../lib/codeEditor';
import { smartCandidate } from '../lib/json/smartInput';

export type { EditorHandle, HistoryState } from '../lib/codeEditor';
type Props = {
  managedFormat?: boolean;
  highlights?: DiffHighlight[];
  readOnly?: boolean; onCursor?: (offset: number) => void;
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
  const compartments = useRef({ indent: new Compartment(), theme: new Compartment(), label: new Compartment(), readOnly: new Compartment() });

  useEffect(() => {
    const initial = latest.current;
    const config = compartments.current;
    let historyState: HistoryState = { undo: false, redo: false };
    source.current = initial.source;
    let snapshotTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingSnapshot = false;
    const flush = () => {
      clearTimeout(snapshotTimer);
      if (!pendingSnapshot) return;
      pendingSnapshot = false;
      source.current = instance.state.doc.toString();
      latest.current.onChange(source.current);
      latest.current.onPendingChange?.(false);
    };
    const format = () => { flush(); requestAnimationFrame(() => latest.current.onFormat()); return true; };
    const instance = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial.source,
        extensions: [
          json(), diffHighlights, lintGutter(), lineNumbers(), foldGutter({ markerDOM(open) {
            const marker = document.createElement('span');
            marker.className = 'cm-foldChevron';
            marker.dataset.open = String(open);
            marker.title = latest.current.language === 'zh' ? (open ? '折叠此行' : '展开此行') : (open ? 'Fold line' : 'Unfold line');
            return marker;
          } }), bracketMatching(), indentOnInput(),
          drawSelection(), highlightActiveLine(), highlightActiveLineGutter(),
          history(), search({ top: true }),
          config.readOnly.of([EditorState.readOnly.of(!!initial.readOnly), EditorView.editable.of(!initial.readOnly)]),
          config.indent.of(indentation(initial.indent)), config.theme.of(editorTheme(initial.theme === 'dark')),
          config.label.of([EditorView.contentAttributes.of({ 'aria-label': initial.label, 'aria-describedby': 'editor-help' }), EditorState.phrases.of(initial.language === 'zh' ? chineseEditorPhrases : {})]),
          keymap.of([
            ...(!initial.managedFormat ? [{ key: 'Mod-Enter', run: format }, { key: 'Alt-Shift-f', run: format }] : []),
            indentWithTab, ...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap,
          ]),
          EditorView.updateListener.of(update => {
            if (update.selectionSet || update.docChanged) latest.current.onCursor?.(update.state.selection.main.from);
            if (update.docChanged && !update.transactions.some(transaction => transaction.annotation(externalChange))) {
              if (update.state.doc.length > 2_000_000) {
                if (!pendingSnapshot) { pendingSnapshot = true; latest.current.onPendingChange?.(true); }
                clearTimeout(snapshotTimer); snapshotTimer = setTimeout(flush, 300);
              } else {
                clearTimeout(snapshotTimer); pendingSnapshot = false;
                source.current = update.state.doc.toString(); latest.current.onChange(source.current); latest.current.onPendingChange?.(false);
              }
            } else if (update.docChanged) {
              clearTimeout(snapshotTimer); pendingSnapshot = false; latest.current.onPendingChange?.(false);
            }
            const next = { undo: undoDepth(update.state) > 0, redo: redoDepth(update.state) > 0 };
            if (next.undo !== historyState.undo || next.redo !== historyState.redo) {
              historyState = next; if (initial.editorRef.current) latest.current.onHistory(next, initial.editorRef.current);
            }
          }),
          EditorView.domEventHandlers({ blur() { flush(); return false; }, paste(event, editor) {
            const text = event.clipboardData?.getData('text/plain');
            if (!text || !latest.current.onPaste || !smartCandidate(text)) return false;
            const selection = editor.state.selection.main;
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
      }),
    });
    view.current = instance;
    const handle: EditorHandle = {
      flush, format,
      history: () => latest.current.readOnly ? { undo: false, redo: false } : { undo: undoDepth(instance.state) > 0, redo: redoDepth(instance.state) > 0 },
      undo: () => { undo(instance); }, redo: () => { redo(instance); }, search: () => { openSearchPanel(instance); },
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
    const unregister = initial.readOnly ? () => {} : registerEditor(instance.dom, handle);
    const syncHistory = () => latest.current.onHistory(handle.history(), handle);
    instance.dom.addEventListener('focusin', syncHistory);
    initial.onHistory(handle.history(), handle);
    return () => {
      clearTimeout(snapshotTimer);
      initial.editorRef.current = null;
      view.current = null;
      instance.dom.removeEventListener('focusin', syncHistory); unregister();
      instance.destroy();
    };
  }, []);

  useEffect(() => {
    const instance = view.current;
    if (!instance || source.current === props.source) return;
    // A pending large-document snapshot may be older than the live CM6 document.
    const changes = documentChange(instance.state.doc.toString(), props.source);
    source.current = props.source;
    instance.dispatch({ changes, annotations: [externalChange.of(true), isolateHistory.of('full')], userEvent: 'input.external' });
  }, [props.source]);
  useEffect(() => {
    const instance = view.current;
    if (instance) instance.dispatch(setDiagnostics(instance.state, editorDiagnostics(props.diagnostics, instance.state.doc.length).map(diagnostic => {
      const line = instance.state.doc.lineAt(diagnostic.from);
      return { ...diagnostic, message: `${props.language === 'zh' ? `第 ${line.number} 行，第 ${diagnostic.from - line.from + 1} 列` : `Line ${line.number}, Col ${diagnostic.from - line.from + 1}`} · ${diagnostic.message}`,
        actions: props.onRepair && diagnostic.severity === 'error' ? [{ name: props.language === 'zh' ? '自动修复' : 'Auto-Fix', apply: () => latest.current.onRepair?.() }] : undefined };
    })));
  }, [props.diagnostics, props.source, props.language]);
  useEffect(() => { view.current?.dispatch({ effects: compartments.current.indent.reconfigure(indentation(props.indent)) }); }, [props.indent]);
  useEffect(() => { view.current?.dispatch({ effects: compartments.current.readOnly.reconfigure([EditorState.readOnly.of(!!props.readOnly), EditorView.editable.of(!props.readOnly)]) }); }, [props.readOnly]);
  useEffect(() => { view.current?.dispatch({ effects: compartments.current.theme.reconfigure(editorTheme(props.theme === 'dark')) }); }, [props.theme]);
  useEffect(() => { view.current?.dispatch({ effects: compartments.current.label.reconfigure([EditorView.contentAttributes.of({ 'aria-label': props.label, 'aria-describedby': 'editor-help' }), EditorState.phrases.of(props.language === 'zh' ? chineseEditorPhrases : {})]) }); }, [props.label, props.language]);
  useEffect(() => { view.current?.dispatch({ effects: setDiffHighlights.of(props.highlights ?? []) }); }, [props.highlights]);
  return <div ref={host} />;
}
