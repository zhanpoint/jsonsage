import type { JsonDiagnostic } from './json/engine';

export type HistoryState = { undo: boolean; redo: boolean };
export type EditorHandle = {
  locate: (start: number, end: number, focus?: boolean) => void;
  undo: () => void; redo: () => void; search: () => void; flush: () => void; format: () => void;
  history: () => HistoryState;
};
const editors = new WeakMap<Element, EditorHandle>();
let focused: { element: HTMLElement; handle: EditorHandle } | undefined;
export function registerEditor(element: HTMLElement, handle: EditorHandle) {
  editors.set(element, handle);
  const focus = () => { focused = { element, handle }; };
  element.addEventListener('focusin', focus);
  return () => {
    element.removeEventListener('focusin', focus); editors.delete(element);
    if (focused?.handle === handle) focused = undefined;
  };
}
export function editorAt(target: Element | null): EditorHandle | undefined {
  const element = target?.closest('.cm-editor');
  return element ? editors.get(element) : undefined;
}
export function activeEditor(fallback: EditorHandle | null): EditorHandle | null {
  return focused?.element.isConnected && !focused.element.closest('[hidden]') ? focused.handle : fallback;
}

/** Preserve unaffected selection, folds and history when another view changes the document. */
export function documentChange(previous: string, next: string) {
  let from = 0;
  while (from < previous.length && from < next.length && previous[from] === next[from]) from++;
  let to = previous.length;
  let end = next.length;
  while (to > from && end > from && previous[to - 1] === next[end - 1]) { to--; end--; }
  return { from, to, insert: next.slice(from, end) };
}
export function editorDiagnostics(diagnostics: readonly JsonDiagnostic[], length: number) {
  return diagnostics.map(issue => {
    const from = Math.max(0, Math.min(issue.start, length));
    return {
      from, to: Math.max(from, Math.min(Math.max(issue.start + 1, issue.end), length)),
      severity: issue.severity, source: issue.code,
      message: issue.message + (issue.hint ? `\n${issue.hint}` : ''),
    };
  });
}
