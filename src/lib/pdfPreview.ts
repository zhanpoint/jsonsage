export type PageBounds = { left: number; top: number; right: number; bottom: number };

/** Bounds of visible ink on a white page, including images, paths and text. */
export function pageInkBounds({ data, width, height }: { data: Uint8ClampedArray; width: number; height: number }): PageBounds | null {
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0, offset = 0; y < height; y++) {
    for (let x = 0; x < width; x++, offset += 4) {
      if (!data[offset + 3] || (data[offset] === 255 && data[offset + 1] === 255 && data[offset + 2] === 255)) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x + 1); bottom = y + 1;
    }
  }
  return right > left ? { left, top, right, bottom } : null;
}
