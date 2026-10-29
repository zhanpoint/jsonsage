import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { fetchDocument, MAX_IMPORT_BYTES } from '../lib/importDocument';

export default function RemoteImport({ language, onLoad, onClose }: { language: 'zh' | 'en'; onLoad: (source: string) => void; onClose: () => void }) {
  const zh = language === 'zh';
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); return () => controller.current?.abort(); }, []);
  async function load() {
    if (busy) return;
    setBusy(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    try { const source = await fetchDocument(input, abort.signal); if (!abort.signal.aborted) { onLoad(source); onClose(); } }
    catch (cause) {
      if (abort.signal.aborted) return;
      setError(cause instanceof Error && cause.message === 'FILE_TOO_LARGE' ? (zh ? `文件超过 ${MAX_IMPORT_BYTES / 1024 / 1024} MiB，已取消导入。请拆分 JSON 后重试。` : `File exceeds ${MAX_IMPORT_BYTES / 1024 / 1024} MiB. Import cancelled. Split the JSON and try again.`) : (zh ? '加载失败，请检查文件链接或网络连接。' : 'Unable to load. Check the file URL or network connection.'));
    } finally { if (!abort.signal.aborted) setBusy(false); }
  }
  return <dialog className="node-dialog" ref={dialog} aria-label={zh ? '从 URL 导入' : 'Import from URL'} onCancel={onClose}>
    <form onSubmit={event => { event.preventDefault(); void load(); }}>
      <div className="node-dialog-title"><strong>{zh ? '从 URL 导入' : 'Import from URL'}</strong><button className="tool-button" type="button" aria-label={zh ? '关闭' : 'Close'} onClick={onClose}><X size={16} /></button></div>
      <input type="url" aria-label={zh ? 'JSON 文件 URL' : 'JSON file URL'} value={input} onChange={event => setInput(event.target.value)} placeholder="https://example.com/data.json" required spellCheck={false} autoFocus disabled={busy} />
      {error && <p role="alert">{error}</p>}
      <div className="node-dialog-buttons"><button type="button" onClick={onClose}>{busy ? (zh ? '取消加载' : 'Cancel loading') : (zh ? '取消' : 'Cancel')}</button><button type="submit" disabled={busy || !input.trim()}>{busy ? (zh ? '加载中…' : 'Loading…') : (zh ? '加载' : 'Load')}</button></div>
    </form>
  </dialog>;
}
