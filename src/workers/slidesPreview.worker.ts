import { parse, slideToSvgFile, type Presentation } from '@web-ppt/core';

let presentation: Presentation | undefined;
self.onmessage = async ({ data }: MessageEvent<{ bytes?: ArrayBuffer; page: number }>) => {
  try {
    if (data.bytes) presentation = await parse(data.bytes);
    if (!presentation?.slides.length) throw new Error('EMPTY_PRESENTATION');
    const slide = presentation.slides[data.page - 1];
    if (!slide) throw new Error('INVALID_PAGE');
    // Keep lazy parsing and asset URLs in this worker; transfer only the current page.
    const svg = await slideToSvgFile(presentation, slide);
    self.postMessage({ page: data.page, total: presentation.slides.length, svg });
  } catch { self.postMessage({ error: true }); }
};
