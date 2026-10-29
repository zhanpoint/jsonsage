type ResourceKind = 'image' | 'audio' | 'video' | 'markdown' | 'pdf' | 'sheet' | 'document' | 'presentation' | 'website' | 'unknown';
export type PreviewResource = { url: string; name: string; kind: ResourceKind };

/** Resolve document links without allowing scripts, local files or embedded credentials. */
export function previewHref(value: string, base?: string): string | null {
  try {
    const url = new URL(value, base);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

const extensions: Record<string, ResourceKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', avif: 'image', svg: 'image', bmp: 'image', ico: 'image',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio',
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', ogv: 'video',
  md: 'markdown', markdown: 'markdown', pdf: 'pdf',
  csv: 'sheet', tsv: 'sheet', xls: 'sheet', xlsx: 'sheet', xlsm: 'sheet',
  doc: 'document', docx: 'document', odt: 'document',
  ppt: 'presentation', pptx: 'presentation',
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
    return { url: url.href, name, kind: extensions[extension] ?? 'unknown' };
  } catch { return null; }
}

const MAX_PREVIEW_BYTES = 20 * 1024 * 1024;
const metadataCache = new Map<string, { resource: PreviewResource; expires: number }>();
const mimeKinds: Record<string, ResourceKind> = {
  'application/pdf': 'pdf', 'text/markdown': 'markdown', 'text/x-markdown': 'markdown',
  'text/csv': 'sheet', 'text/tab-separated-values': 'sheet', 'application/vnd.ms-excel': 'sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'sheet',
  'application/msword': 'document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-powerpoint': 'presentation', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
  'text/html': 'website', 'application/xhtml+xml': 'website',
};
const mimeExtensions: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-excel': 'xls', 'text/csv': 'csv', 'text/tab-separated-values': 'tsv',
};
export function resourceFromMetadata(resource: PreviewResource, metadata: { contentType: string; name?: string }): PreviewResource {
  const mime = metadata.contentType.split(';')[0].trim().toLowerCase();
  let name = metadata.name || resource.name;
  const kind = mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video'
    : mimeKinds[mime] ?? extensions[name.split('.').at(-1)?.toLowerCase() ?? ''] ?? resource.kind;
  // Decoders for office files need a format hint when a download endpoint omits it.
  const extension = mimeExtensions[mime];
  if (extension && !name.toLowerCase().endsWith('.' + extension)) name += '.' + extension;
  return { ...resource, name, kind };
}

/** A HEAD-only proxy request discovers extensionless files without downloading their bodies. */
export async function resolvePreviewResource(resource: PreviewResource, signal: AbortSignal): Promise<PreviewResource> {
  if (resource.kind !== 'unknown') return resource;
  const cached = metadataCache.get(resource.url);
  if (cached && cached.expires > Date.now()) return cached.resource;
  const response = await fetch(`${import.meta.env?.BASE_URL ?? '/'}api/preview?metadata=1&url=${encodeURIComponent(resource.url)}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]), credentials: 'omit', referrerPolicy: 'no-referrer',
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); throw new Error('METADATA_UNAVAILABLE'); }
  const metadata: unknown = await response.json();
  if (!metadata || typeof metadata !== 'object' || !('contentType' in metadata) || typeof metadata.contentType !== 'string') throw new Error('INVALID_METADATA');
  const resolved = resourceFromMetadata(resource, { contentType: metadata.contentType, name: 'name' in metadata && typeof metadata.name === 'string' ? metadata.name : undefined });
  if (metadataCache.size >= 100) metadataCache.delete(metadataCache.keys().next().value!);
  metadataCache.set(resource.url, { resource: resolved, expires: Date.now() + 5 * 60_000 });
  return resolved;
}

/** Bounded, cancellable fetch. A preview never forwards cookies to another host. */
export async function fetchPreview(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const idle = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const progress = () => { clearTimeout(timeout); timeout = setTimeout(() => idle.abort(new DOMException('Preview download stalled', 'TimeoutError')), 30_000); };
  const requestSignal = AbortSignal.any([signal, idle.signal]);
  const options = { signal: requestSignal, credentials: 'omit', referrerPolicy: 'no-referrer' } as const;
  progress();
  try {
    let response: Response;
    try { response = await fetch(url, options); }
    catch (error) {
      // Only network/CORS failures need the same-origin transport. Parsing stays local.
      if (!(error instanceof TypeError) || requestSignal.aborted) throw error;
      progress();
      response = await fetch(`${import.meta.env?.BASE_URL ?? '/'}api/preview?url=${encodeURIComponent(url)}`, options);
      if (response.headers.get('content-type')?.includes('text/html')) { await response.body?.cancel(); throw error; }
    }
    progress();
    if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
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
        progress();
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
  } finally { clearTimeout(timeout); }
}
