import { useLayoutEffect, useState, type RefObject } from 'react';

export type PreviewAppearance = { dark: boolean; background: string; foreground: string; accent: string };

/** Observe the app theme once; do not poll or reload the document when colors change. */
export function usePreviewAppearance(host: RefObject<HTMLElement | null>) {
  const [appearance, setAppearance] = useState<PreviewAppearance>({ dark: false, background: 'rgb(255, 255, 255)', foreground: 'rgb(38, 50, 71)', accent: 'rgb(89, 133, 232)' });
  useLayoutEffect(() => {
    const panel = host.current?.closest<HTMLElement>('.text-preview');
    const shell = panel?.closest('[data-theme]');
    if (!panel || !shell) return;
    const update = () => {
      const style = getComputedStyle(panel);
      const next = { dark: shell.getAttribute('data-theme') === 'dark', background: style.backgroundColor, foreground: style.color,
        accent: getComputedStyle(panel.querySelector('.preview-toolbar a') ?? panel).color };
      setAppearance(previous => Object.keys(next).every(key => previous[key as keyof PreviewAppearance] === next[key as keyof PreviewAppearance]) ? previous : next);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(shell, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
    return () => observer.disconnect();
  }, [host]);
  return appearance;
}
