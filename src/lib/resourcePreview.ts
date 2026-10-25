type ResourceKind = 'image' | 'audio' | 'video' | 'markdown' | 'pdf' | 'sheet' | 'document' | 'website';
export type PreviewResource = { url: string; name: string; kind: ResourceKind };

const extensions: Record<string, ResourceKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', avif: 'image', svg: 'image', bmp: 'image', ico: 'image',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio',
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', ogv: 'video',
  md: 'markdown', markdown: 'markdown', pdf: 'pdf',
  csv: 'sheet', tsv: 'sheet', xls: 'sheet', xlsx: 'sheet', xlsm: 'sheet',
  doc: 'document', docx: 'document', odt: 'document',
};

/** Classify the complete field value, never URLs found inside prose or code. */
export function previewResource(text: string): PreviewResource | null {
  const value = text.trim();
  if (!/^https?:\/\//i.test(value) || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    const name = decodeURIComponent(url.pathname.split('/').at(-1) || url.hostname);
    const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
    return { url: url.href, name, kind: extensions[extension] ?? 'website' };
  } catch { return null; }
}

const MAX_PREVIEW_BYTES = 20 * 1024 * 1024;
/** Bounded, cancellable fetch. A preview never forwards cookies to another host. */
export async function fetchPreview(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]), credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > MAX_PREVIEW_BYTES) {
    await response.body?.cancel();
    throw new Error('PREVIEW_TOO_LARGE');
  }
  const reader = response.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_PREVIEW_BYTES) throw new Error('PREVIEW_TOO_LARGE');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes.buffer;
}
