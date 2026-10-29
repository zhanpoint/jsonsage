self.onmessage = async ({ data }: MessageEvent<{ bytes: ArrayBuffer; name: string; kind: 'sheet' | 'document'; url: string }>) => {
  try {
    if (data.kind === 'sheet') {
      const { workbookPreview } = await import('../lib/officePreview');
      self.postMessage({ workbook: workbookPreview(data.bytes, data.name, data.url) });
    }
    else {
      const { convertToHtml, images } = await import('mammoth');
      const { value } = await convertToHtml({ arrayBuffer: data.bytes }, {
        includeEmbeddedStyleMap: false, externalFileAccess: false,
        // This text viewer omits images; avoid inflating them into base64 first.
        convertImage: images.imgElement(async () => ({ src: '' })),
      });
      if (value.length > 2_000_000) throw new Error('PREVIEW_TOO_LARGE');
      self.postMessage({ html: value });
    }
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'PREVIEW_FAILED' }); }
};
