import { workbookPreview } from '../lib/officePreview';
import { convertToHtml } from 'mammoth';

self.onmessage = async ({ data }: MessageEvent<{ bytes: ArrayBuffer; name: string; kind: 'sheet' | 'document' }>) => {
  try {
    if (data.kind === 'sheet') self.postMessage({ workbook: workbookPreview(data.bytes, data.name) });
    else {
      const { value } = await convertToHtml({ arrayBuffer: data.bytes }, { includeEmbeddedStyleMap: false, externalFileAccess: false });
      if (value.length > 2_000_000) throw new Error('PREVIEW_TOO_LARGE');
      self.postMessage({ html: value });
    }
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'PREVIEW_FAILED' }); }
};
