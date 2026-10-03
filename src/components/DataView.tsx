import { lazy, Suspense } from 'react';
import type { Node } from 'jsonc-parser';
import type { StructuredProps } from './StructuredViews';
import { STRUCTURE_LIMIT } from '../lib/json/views';
const StructuredViews = lazy(() => import('./StructuredViews'));
const LargeTree = lazy(() => import('./LargeTree'));
const LargeViews = lazy(() => import('./LargeViews'));
export default function DataView({ root, pending, valid, structureError, onLocate, ...props }: Omit<StructuredProps, 'root'> & {
  root?: Node; pending: boolean; valid: boolean; structureError: boolean; onLocate: (start: number, end: number) => void;
}) {
  const zh = props.language === 'zh';
  const message = (text: string) => <div className="view-message">{text}</div>;
  if (pending) return message(zh ? '正在检查 JSON…' : 'Checking JSON…');
  if (!valid) return message(zh ? '修复语法问题后即可使用结构化视图。' : 'Fix syntax issues to use structured views.');
  return <div className="data-view"><Suspense fallback={message(zh ? '正在加载视图…' : 'Loading view…')}>
    {props.source.length > STRUCTURE_LIMIT || structureError ? props.view === 'tree' ? <LargeTree source={props.source} language={props.language} onContextPath={props.onContextPath} onLocate={onLocate} /> : <LargeViews source={props.source} language={props.language} mode={props.view} onContextPath={props.onContextPath} /> : root ? <StructuredViews {...props} root={root} /> : message(zh ? '此 JSON 无法生成结构化视图。' : 'Unable to build a structured view.')}
  </Suspense></div>;
}
