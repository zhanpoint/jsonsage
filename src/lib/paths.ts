import { pathText, type JsonPath } from './json/views';
export const pathFormats = ['jsonpath', 'javascript', 'jq', 'pointer'] as const;
export type PathFormat = typeof pathFormats[number];
export function formatPath(path: JsonPath, format: PathFormat): string {
  if (format === 'pointer') return path.map(part => '/' + String(part).replace(/~/g, '~0').replace(/\//g, '~1')).join('');
  if (format === 'jsonpath') return pathText(path);
  if (format === 'javascript') return 'res' + pathText(path).slice(1);
  return path.reduce<string>((text, part) => typeof part === 'number' ? `${text}[${part}]` : /^[A-Za-z_]\w*$/.test(part) ? `${text === '.' ? '' : text}.${part}` : `${text}[${JSON.stringify(part)}]`, '.') || '.';
}
