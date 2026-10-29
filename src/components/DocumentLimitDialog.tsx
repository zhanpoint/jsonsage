import { useEffect, useId, useRef } from 'react';
import { MAX_DOCUMENT_CHARACTERS, MAX_IMPORT_BYTES } from '../lib/documentLimits';

export default function DocumentLimitDialog({ kind, language, onClose }: { kind: 'file' | 'text'; language: 'zh' | 'en'; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const zh = language === 'zh';
  const title = zh ? (kind === 'file' ? '文件过大，无法打开' : '内容过大，已取消操作') : (kind === 'file' ? 'File too large to open' : 'Content too large — operation cancelled');
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="node-dialog document-limit-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={onClose}>
    <div className="node-dialog-title"><strong id={`${id}-title`}>{title}</strong></div>
    <p id={`${id}-description`}>{zh ? '为避免浏览器内存不足，本次操作已取消，原有内容保持不变。请拆分 JSON 后重试。' : 'The operation was cancelled to avoid exhausting browser memory. Your existing content is unchanged. Split the JSON into smaller parts and try again.'}</p>
    <p>{kind === 'file'
      ? (zh ? `单个文件上限：${MAX_IMPORT_BYTES / 1024 / 1024} MiB。` : `Maximum file size: ${MAX_IMPORT_BYTES / 1024 / 1024} MiB.`)
      : (zh ? `编辑内容上限：${MAX_DOCUMENT_CHARACTERS.toLocaleString('zh-CN')} 个字符。` : `Editor limit: ${MAX_DOCUMENT_CHARACTERS.toLocaleString('en-US')} characters.`)}</p>
    <div className="node-dialog-buttons"><button type="button" autoFocus onClick={onClose}>{zh ? '知道了' : 'Got it'}</button></div>
  </dialog>;
}
