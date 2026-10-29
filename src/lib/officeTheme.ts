import { defaultTheme, invertColorByMatrix, type Theme } from '@univerjs/presets';
import type { PreviewAppearance } from '../hooks/usePreviewAppearance';

type RGB = [number, number, number];
const rgb = (value: string): RGB => value.match(/[\d.]+/g)!.slice(0, 3).map(Number) as RGB;
const hex = (value: RGB) => `#${value.map(n => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: RGB, b: RGB, weight: number): RGB => a.map((n, i) => n + (b[i] - n) * weight) as RGB;

export function officeTheme({ dark, background, foreground, accent }: PreviewAppearance): Theme {
  const surface = rgb(background), text = rgb(foreground), primary = rgb(accent);
  // CanvasColorService applies this same public transform in dark mode. Supply
  // light-side tokens, while the DOM's dark tokens use the current app surface.
  const light = dark ? invertColorByMatrix(surface) : surface;
  const deep = dark ? surface : text;
  const gray = { ...defaultTheme.gray };
  for (const key of Object.keys(gray)) {
    const level = Number(key) as keyof typeof gray;
    gray[level] = hex(mix(light, deep, level / 1000));
  }
  if (dark) { gray[700] = hex(surface); gray[900] = hex(surface); }
  const colors = { ...defaultTheme.primary };
  for (const key of Object.keys(colors)) {
    const level = Number(key) as keyof typeof colors;
    colors[level] = hex(level < 500 ? mix(primary, light, 1 - level / 500) : mix(primary, deep, (level - 500) / 500));
  }
  return { ...defaultTheme, gray, primary: colors,
    blue: { ...defaultTheme.blue, 600: hex(dark ? invertColorByMatrix(primary) : primary) } };
}
