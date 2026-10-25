import { stringify } from 'lossless-json';
import { parse } from './engine';
import { isRecordStream } from './document';
import type { Indent } from './transforms';

export type AdvancedRequest = { kind: 'types'; source: string; jsonc: boolean; indent: Indent; target?: 'typescript' | 'python' | 'go' | 'rust' };
export type AdvancedResult = { kind: 'output'; source: string; format: 'typescript' | 'python' | 'go' | 'rust'; count: number };

export async function advanced(request: AdvancedRequest): Promise<AdvancedResult> {
  const { source, jsonc, indent } = request;
  const spacing = indent === 'tab' ? '\t' : ' '.repeat(Number(indent));
  const input = jsonc || isRecordStream(source) ? stringify(parse(source, { mode: jsonc ? 'jsonc' : 'strict', lossless: true }))! : source;
  const { generateTypes } = await import('./typeGeneration');
  const target = request.target ?? 'typescript';
  const lines = await generateTypes(input, target, spacing);
  return { kind: 'output', source: lines.join('\n'), format: target, count: lines.length };
}
