import { LoaderCircle } from 'lucide-react';

export default function PreviewLoading({ language, message }: { language: 'zh' | 'en'; message?: string }) {
  return <div className="preview-loading" role="status">
    <span className="preview-loading-content"><LoaderCircle size={16} aria-hidden="true" />{message ?? (language === 'zh' ? '正在加载…' : 'Loading…')}</span>
  </div>;
}
