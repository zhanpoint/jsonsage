import { useEffect, useRef, useState } from 'react';
import { createUniver, DocumentFlavor, LocaleType, mergeLocales, type IWorkbookData } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import { convertClipboardHtmlToDocumentData, UniverDocsPlugin, UniverDocsUIPlugin, UniverRenderEnginePlugin, UniverUIPlugin, UniverFormulaEnginePlugin } from '@univerjs/preset-docs-core';
import sheetsZh from '@univerjs/preset-sheets-core/locales/zh-CN';
import sheetsEn from '@univerjs/preset-sheets-core/locales/en-US';
import docsZh from '@univerjs/preset-docs-core/locales/zh-CN';
import docsEn from '@univerjs/preset-docs-core/locales/en-US';
import { UniverDocsHyperLinkPreset } from '@univerjs/preset-docs-hyper-link';
import { UniverSheetsHyperLinkPreset } from '@univerjs/preset-sheets-hyper-link';
import docsLinksZh from '@univerjs/preset-docs-hyper-link/locales/zh-CN';
import docsLinksEn from '@univerjs/preset-docs-hyper-link/locales/en-US';
import sheetsLinksZh from '@univerjs/preset-sheets-hyper-link/locales/zh-CN';
import sheetsLinksEn from '@univerjs/preset-sheets-hyper-link/locales/en-US';
import DOMPurify from 'dompurify';
import { fetchPreview, previewHref, type PreviewResource } from '../lib/resourcePreview';
import { usePreviewAppearance } from '../hooks/usePreviewAppearance';
import { officeTheme } from '../lib/officeTheme';
import PreviewLoading from './PreviewLoading';
import '@univerjs/preset-sheets-core/lib/index.css';
import '@univerjs/preset-docs-core/lib/index.css';
import '@univerjs/preset-docs-hyper-link/lib/index.css';
import '@univerjs/preset-sheets-hyper-link/lib/index.css';

export default function OfficePreview({ resource, language, onError }: {
  resource: PreviewResource; language: 'zh' | 'en'; onError: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const appearance = usePreviewAppearance(host);
  const locale = language === 'zh' ? LocaleType.ZH_CN : LocaleType.EN_US;
  const api = useRef<ReturnType<typeof createUniver>['univerAPI'] | null>(null);
  const settings = useRef({ appearance, locale });
  settings.current = { appearance, locale };
  useEffect(() => { api.current?.setLocale(locale); }, [locale]);
  useEffect(() => {
    api.current?.setTheme(officeTheme(appearance));
    api.current?.toggleDarkMode(appearance.dark);
  }, [appearance]);
  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    const worker = new Worker(new URL('../workers/officePreview.worker.ts', import.meta.url), { type: 'module' });
    const container = document.createElement('div');
    container.className = 'office-canvas';
    host.current?.append(container);
    let dispose: (() => void) | undefined;
    const fail = () => { if (!controller.signal.aborted) onError(); };
    let timeout: number | undefined;
    worker.onerror = fail;
    worker.onmessage = async ({ data }: MessageEvent<{ workbook?: Partial<IWorkbookData>; html?: string; error?: string }>) => {
      worker.terminate();
      if (controller.signal.aborted) return;
      try {
        if (data.error || !host.current) throw new Error(data.error);
        const config = { container, header: false, toolbar: false, contextMenu: false, disableAutoFocus: true } as const;
        const { univer, univerAPI } = createUniver({
          locale: settings.current.locale,
          locales: { [LocaleType.ZH_CN]: mergeLocales(sheetsZh, docsZh, sheetsLinksZh, docsLinksZh), [LocaleType.EN_US]: mergeLocales(sheetsEn, docsEn, sheetsLinksEn, docsLinksEn) },
          theme: officeTheme(settings.current.appearance),
          darkMode: settings.current.appearance.dark,
          presets: [data.workbook ? UniverSheetsCorePreset({
            ...config, formulaBar: false,
            footer: { sheetBar: true, statisticBar: false, menus: false, zoomSlider: true, addSheetButtonConfig: { show: false } },
          }) : {
            // The docs preset does not expose fitToWidth. Configure its core plugins
            // directly so layout follows the resizable sidebar, including first mount.
            plugins: [UniverDocsPlugin, UniverRenderEnginePlugin, [UniverUIPlugin, { ...config, footer: false }],
              [UniverDocsUIPlugin, { fitToWidth: { mode: 'fit-width', target: 'container', align: 'start', paddingX: 16 } }],
              UniverFormulaEnginePlugin],
          }, data.workbook ? UniverSheetsHyperLinkPreset({ urlHandler: { navigateToOtherWebsite: value => {
            const href = previewHref(value, resource.url);
            if (href) window.open(href, '_blank', 'noopener,noreferrer');
          } } }) : UniverDocsHyperLinkPreset()],
        });
        api.current = univerAPI;
        dispose = () => univer.dispose();
        // This is a viewer embedded beside another editor. Do not let Univer's
        // global editing shortcuts intercept JSON typing, undo, or selection.
        univerAPI.getShortcut().disableShortcut();
        const rendered = new Promise<void>(resolve => {
          const subscription = univerAPI.addEvent(univerAPI.Event.LifeCycleChanged, ({ stage }) => {
            if (stage >= univerAPI.Enum.LifecycleStages.Rendered) { subscription.dispose(); resolve(); }
          });
          controller.signal.addEventListener('abort', () => { subscription.dispose(); resolve(); }, { once: true });
        });
        let makeReadOnly: () => Promise<void>;
        if (data.workbook) {
          const workbook = univerAPI.createWorkbook(data.workbook);
          makeReadOnly = () => workbook.getWorkbookPermission().setReadOnly();
        }
        else {
          const fragment = DOMPurify.sanitize(data.html ?? '', { USE_PROFILES: { html: true }, FORBID_TAGS: ['img', 'style'], RETURN_DOM_FRAGMENT: true });
          for (const link of fragment.querySelectorAll('a[href]')) {
            const href = previewHref(link.getAttribute('href')!, resource.url);
            if (href) link.setAttribute('href', href);
            else link.removeAttribute('href');
          }
          const body = window.document.createElement('div');
          body.append(fragment);
          const snapshot = convertClipboardHtmlToDocumentData(body.innerHTML);
          const document = univerAPI.createDocument({ ...snapshot, id: 'preview-document', title: resource.name,
            documentStyle: { ...snapshot.documentStyle, documentFlavor: DocumentFlavor.TRADITIONAL, pageSize: { width: 595, height: 842 }, marginTop: 32, marginBottom: 32, marginLeft: 32, marginRight: 32 },
          });
          makeReadOnly = () => document.getPermission().setReadOnly();
        }
        // Let initial normalization finish before locking edits. Keep the loading
        // surface in place until permissions are applied.
        if (univerAPI.getCurrentLifecycleStage() < univerAPI.Enum.LifecycleStages.Rendered) await rendered;
        if (controller.signal.aborted) return;
        await makeReadOnly();
        if (!controller.signal.aborted) setLoading(false);
      } catch { fail(); }
      finally { window.clearTimeout(timeout); }
    };
    void fetchPreview(resource.url, controller.signal).then(bytes => {
      if (controller.signal.aborted) return;
      // Parsing/rendering has its own budget; slow downloads must not consume it.
      timeout = window.setTimeout(() => { controller.abort(); worker.terminate(); onError(); }, 30_000);
      worker.postMessage({ bytes, name: resource.name, kind: resource.kind, url: resource.url }, [bytes]);
    }).catch(fail);
    return () => { controller.abort(); window.clearTimeout(timeout); worker.terminate(); api.current = null; queueMicrotask(() => { dispose?.(); container.remove(); }); };
  }, [resource.url, resource.name, resource.kind, onError]);
  return <div className="office-preview">
    {loading && <PreviewLoading language={language} />}
    <div ref={host} className="office-canvas" aria-label={resource.name} inert={loading} aria-busy={loading} />
  </div>;
}
