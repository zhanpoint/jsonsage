import assert from 'node:assert/strict';
import { pageInkBounds } from '../src/lib/pdfPreview';

const image = { width: 12, height: 10, data: new Uint8ClampedArray(12 * 10 * 4).fill(255) };
const pixel = (x: number, y: number, rgba: number[]) => image.data.set(rgba, (y * image.width + x) * 4);
assert.equal(pageInkBounds(image), null);
pixel(2, 3, [0, 0, 0, 255]);
pixel(9, 7, [0, 80, 160, 255]);
pixel(0, 0, [0, 0, 0, 0]);
assert.deepEqual(pageInkBounds(image), { left: 2, top: 3, right: 10, bottom: 8 });
// Faint marks and edge-to-edge artwork must not be discarded as paper margins.
pixel(0, 0, [254, 255, 255, 255]);
pixel(11, 9, [255, 255, 254, 255]);
assert.deepEqual(pageInkBounds(image), { left: 0, top: 0, right: 12, bottom: 10 });
image.data.fill(0);
assert.equal(pageInkBounds(image), null);
console.log('PDF content bounds: white/transparent pages, artwork, faint marks and edge pixels passed.');
