import { parse } from 'shell-quote';

export const MAX_IMPORT_BYTES = 128 * 1024 * 1024;

export async function readLocalDocument(file: Pick<File, 'size' | 'arrayBuffer'>): Promise<string> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('FILE_TOO_LARGE');
  // Invalid UTF-8 must be rejected rather than silently replacing private data.
  return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
}

/** Parse cURL arguments as data. Never execute a command or expand shell variables. */
export function importRequest(input: string): { url: string; headers: Headers } {
  const text = input.trim();
  const headers = new Headers();
  let url = text;
  if (/^curl(?:\s|$)/i.test(text)) {
    const tokens = parse(text.replace(/\\\r?\n/g, ' '), name => { throw new Error(`Shell variables are not supported: ${name}`); });
    if (tokens.some(token => typeof token !== 'string')) throw new Error('Shell operators are not supported');
    const args = tokens as string[];
    url = '';
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === '-H' || arg === '--header') {
        const header = args[++i] ?? '';
        const colon = header.indexOf(':');
        if (colon < 1) throw new Error('Invalid header');
        headers.append(header.slice(0, colon).trim(), header.slice(colon + 1).trim());
      } else if (arg === '-X' || arg === '--request') {
        if (args[++i]?.toUpperCase() !== 'GET') throw new Error('Only GET requests are supported');
      } else if (arg === '--url') {
        if (url) throw new Error('Use one URL');
        url = args[++i] ?? '';
      } else if (['-L', '--location', '--compressed', '-s', '--silent', '--globoff', '-g'].includes(arg)) {
        continue;
      } else if (arg.startsWith('-')) throw new Error(`Unsupported cURL option: ${arg}`);
      else { if (url) throw new Error('Use one URL'); url = arg; }
    }
  }
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Use an HTTP(S) URL without embedded credentials');
  return { url: parsed.href, headers };
}

export async function fetchDocument(input: string, signal: AbortSignal) {
  const { url, headers } = importRequest(input);
  const response = await fetch(url, { headers, signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok || Number(response.headers.get('content-length')) > MAX_IMPORT_BYTES) {
    await response.body?.cancel();
    throw new Error(response.ok ? 'FILE_TOO_LARGE' : `HTTP ${response.status}`);
  }
  if (!response.body) throw new Error('EMPTY_RESPONSE');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunks: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_IMPORT_BYTES) throw new Error('FILE_TOO_LARGE');
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally { try { await reader.cancel(); } finally { reader.releaseLock(); } }
}
