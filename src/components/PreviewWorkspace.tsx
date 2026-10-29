import type { ReactNode } from 'react';
import ResizableColumns from './ResizableColumns';

export default function PreviewWorkspace({ children, preview, language }: { children: ReactNode; preview: ReactNode; language: 'zh' | 'en' }) {
  return <ResizableColumns className="preview-workspace" secondary={preview} label={language === 'zh' ? '调整预览宽度' : 'Resize preview'}>
    <div className="editor-content">{children}</div>
  </ResizableColumns>;
}
