import { FileSearch } from 'lucide-react';

export default function PreviewEmpty({ language = 'zh' }: { language?: 'zh' | 'en' }) {
  return <div className="text-preview-empty" role="status">
    <FileSearch size={30} strokeWidth={1.4} aria-hidden="true" />
    <span>{language === 'zh' ? '暂无 Markdown 或公式可预览' : 'No Markdown or math to preview'}</span>
  </div>;
}
