import { MAX_IMPORT_BYTES } from './documentLimits';
export { MAX_IMPORT_BYTES } from './documentLimits';

export async function readLocalDocument(file: Pick<File, 'size' | 'arrayBuffer'>): Promise<string> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('FILE_TOO_LARGE');
  // Invalid UTF-8 must be rejected rather than silently replacing private data.
  return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
}

/** URL imports follow the browser's network and system proxy configuration. */
export function importRequest(input: string): string {
  const parsed = new URL(input.trim());
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Use an HTTP(S) URL without embedded credentials');
  return parsed.href;
}

export async function fetchDocument(input: string, signal: AbortSignal) {
  const url = importRequest(input);
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
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
