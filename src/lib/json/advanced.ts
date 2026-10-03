import { stringify } from 'lossless-json';
import { parse } from './engine';
import type { Indent } from './transforms';

export type AdvancedRequest = { kind: 'jq'; source: string; expression: string; jsonc: boolean; indent: Indent } | { kind: 'types'; source: string; jsonc: boolean; indent: Indent; target?: 'typescript' | 'python' | 'go' | 'rust' };
export type AdvancedResult = { kind: 'output'; source: string; format: 'json' | 'typescript' | 'python' | 'go' | 'rust'; count: number };
type JqRuntime = { raw: (source: string, filter: string, flags?: string[]) => string };
let runtime: Promise<JqRuntime> | undefined;
export async function advanced(request: AdvancedRequest): Promise<AdvancedResult> {
  const { source, kind, jsonc, indent } = request;
  const spacing = indent === 'tab' ? '\t' : Number(indent);
  // Strip only JSONC syntax using a lossless round trip before passing standard JSON.
  const input = jsonc ? stringify(parse(source, { mode: 'jsonc', lossless: true }))! : source;
  if (kind === 'types') {
    const { generateTypes } = await import('./typeGeneration');
    const target = request.target ?? 'typescript';
    const lines = await generateTypes(input, target, typeof spacing === 'string' ? spacing : ' '.repeat(spacing));
    return { kind: 'output', source: lines.join('\n'), format: target, count: lines.length };
  }
  runtime ??= import(/* @vite-ignore */ new URL('vendor/jq.mjs', self.location.origin + import.meta.env.BASE_URL).href)
    .then(module => module.default({ locateFile: (file: string) => new URL(`vendor/${file}`, self.location.origin + import.meta.env.BASE_URL).href }));
  const jq = await runtime;
  // raw() bypasses jq-web.json()'s lossy native JSON.parse/stringify wrappers.
  const output = jq.raw(input, request.expression, ['-c']);
  if (output.length > 128 * 1024 * 1024) throw new Error('OUTPUT_TOO_LARGE');
  const lines = output.trim().split('\n').filter(Boolean);
  const results = lines.map(line => parse(line, { lossless: true }));
  const value = results.length === 1 ? results[0] : results;
  const formatted = stringify(value, null, spacing)!;
  return { kind: 'output', source: formatted, format: 'json', count: results.length };
}
