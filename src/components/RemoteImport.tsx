import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { fetchDocument } from '../lib/importDocument';

export default function RemoteImport({ language, onLoad, onClose }: { language: 'zh' | 'en'; onLoad: (source: string) => void; onClose: () => void }) {
  const zh = language === 'zh';
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); return () => controller.current?.abort(); }, []);
  async function load() {
    setBusy(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    try { const source = await fetchDocument(input, abort.signal); if (!abort.signal.aborted) { onLoad(source); onClose(); } }
    catch (cause) {
      if (abort.signal.aborted) return;
      setError(cause instanceof Error && cause.message === 'FILE_TOO_LARGE' ? (zh ? '文件超过 128 MiB。' : 'File exceeds 128 MiB.') : (zh ? '加载失败。请检查 URL、GET cURL 参数和服务器 CORS 授权。' : 'Unable to load. Check the URL, GET cURL options and server CORS permissions.'));
    } finally { if (!abort.signal.aborted) setBusy(false); }
  }
  return <dialog className="node-dialog" ref={dialog} aria-label={zh ? '从 URL 导入' : 'Import from URL'} onCancel={onClose}>
    <form onSubmit={event => { event.preventDefault(); void load(); }}>
      <div className="node-dialog-title"><strong>{zh ? '从 URL 导入' : 'Import from URL'}</strong><button className="tool-button" type="button" aria-label={zh ? '关闭' : 'Close'} onClick={onClose}><X size={16} /></button></div>
      <textarea aria-label="URL / cURL" value={input} onChange={event => setInput(event.target.value)} placeholder={'https://example.com/data.json\n\ncurl "https://example.com/data.json" -H "Accept: application/json"'} spellCheck={false} autoFocus />
      <div className="import-hint">{zh ? '浏览器直接 GET 请求指定地址，不经过代理。支持 -H、-X GET、-L；服务器需允许 CORS。' : 'Direct browser GET, without a proxy. Supports -H, -X GET, -L; the server must allow CORS.'}</div>
      {error && <p role="alert">{error}</p>}
      <div className="node-dialog-buttons"><button type="button" onClick={onClose}>{busy ? (zh ? '取消加载' : 'Cancel loading') : (zh ? '取消' : 'Cancel')}</button><button type="submit" disabled={busy || !input.trim()}>{busy ? (zh ? '加载中…' : 'Loading…') : (zh ? '加载' : 'Load')}</button></div>
    </form>
  </dialog>;
}
