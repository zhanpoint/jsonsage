import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DocumentWorkspace } from '../lib/documentWorkspace';
import type { HistoryDraft } from '../lib/historySession';

export function useDocumentWorkspace(initial: HistoryDraft, autoSave: boolean, flushEditor: () => void) {
  const [workspace] = useState(() => new DocumentWorkspace(initial));
  const state = useSyncExternalStore(workspace.subscribe, workspace.snapshot);
  const flush = useRef(flushEditor); flush.current = flushEditor;
  const remembered = useRef('');
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { void workspace.restore(localStorage.getItem('jsonsage-tabs')).catch(setError); }, [workspace]);
  useEffect(() => {
    workspace.setAutoSave(autoSave);
    return () => workspace.setAutoSave(false);
  }, [workspace, autoSave]);
  useEffect(() => {
    if (!state.ready) return;
    const value = workspace.remember();
    if (value !== remembered.current) { localStorage.setItem('jsonsage-tabs', value); remembered.current = value; }
  }, [state, workspace]);
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden') { flush.current(); if (autoSave) void workspace.saveAll(); } };
    const leave = (event: BeforeUnloadEvent) => { flush.current(); if (workspace.hasUnsaved()) { event.preventDefault(); event.returnValue = ''; } };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('beforeunload', leave);
    return () => { document.removeEventListener('visibilitychange', hidden); window.removeEventListener('beforeunload', leave); };
  }, [workspace, autoSave]);
  const active = state.tabs.find(tab => tab.id === state.activeId)!;
  return { ...state, workspace, active, error };
}
