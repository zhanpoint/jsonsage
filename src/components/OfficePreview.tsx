import { useEffect, useRef, useState } from 'react';
import { createUniver, DocumentFlavor, LocaleType, mergeLocales, type IWorkbookData } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import { convertClipboardHtmlToDocumentData, UniverDocsPlugin, UniverDocsUIPlugin, UniverRenderEnginePlugin, UniverUIPlugin, UniverFormulaEnginePlugin } from '@univerjs/preset-docs-core';
import sheetsZh from '@univerjs/preset-sheets-core/locales/zh-CN';
import sheetsEn from '@univerjs/preset-sheets-core/locales/en-US';
import docsZh from '@univerjs/preset-docs-core/locales/zh-CN';
import docsEn from '@univerjs/preset-docs-core/locales/en-US';
import DOMPurify from 'dompurify';
import { fetchPreview, type PreviewResource } from '../lib/resourcePreview';
import '@univerjs/preset-sheets-core/lib/index.css';
import '@univerjs/preset-docs-core/lib/index.css';

export default function OfficePreview({ resource, language, onError }: {
  resource: PreviewResource; language: 'zh' | 'en'; onError: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    const worker = new Worker(new URL('../workers/officePreview.worker.ts', import.meta.url), { type: 'module' });
    const container = document.createElement('div');
    container.className = 'office-canvas';
    host.current?.append(container);
    let dispose: (() => void) | undefined;
    let themeObserver: MutationObserver | undefined;
    const fail = () => { if (!controller.signal.aborted) onError(); };
    const timeout = window.setTimeout(() => { controller.abort(); worker.terminate(); onError(); }, 30_000);
    worker.onerror = fail;
    worker.onmessage = async ({ data }: MessageEvent<{ workbook?: Partial<IWorkbookData>; html?: string; error?: string }>) => {
      worker.terminate();
      if (controller.signal.aborted) return;
      try {
        if (data.error || !host.current) throw new Error(data.error);
        const config = { container, header: false, toolbar: false, contextMenu: false, disableAutoFocus: true } as const;
        const themeHost = host.current.closest('[data-theme]');
        const isDark = () => themeHost?.getAttribute('data-theme') === 'dark';
        const { univer, univerAPI } = createUniver({
          locale: language === 'zh' ? LocaleType.ZH_CN : LocaleType.EN_US,
          locales: { [LocaleType.ZH_CN]: mergeLocales(sheetsZh, docsZh), [LocaleType.EN_US]: mergeLocales(sheetsEn, docsEn) },
          darkMode: isDark(),
          presets: [data.workbook ? UniverSheetsCorePreset({
            ...config, formulaBar: false,
            footer: { sheetBar: true, statisticBar: false, menus: false, zoomSlider: true, addSheetButtonConfig: { show: false } },
          }) : {
            // The docs preset does not expose fitToWidth. Configure its core plugins
            // directly so layout follows the resizable sidebar, including first mount.
            plugins: [UniverDocsPlugin, UniverRenderEnginePlugin, [UniverUIPlugin, { ...config, footer: false }],
              [UniverDocsUIPlugin, { fitToWidth: { mode: 'fit-width', target: 'container', align: 'start', paddingX: 16 } }],
              UniverFormulaEnginePlugin],
          }],
        });
        dispose = () => univer.dispose();
        // This is a viewer embedded beside another editor. Do not let Univer's
        // global editing shortcuts intercept JSON typing, undo, or selection.
        univerAPI.getShortcut().disableShortcut();
        if (themeHost) {
          themeObserver = new MutationObserver(() => univerAPI.toggleDarkMode(isDark()));
          themeObserver.observe(themeHost, { attributes: true, attributeFilter: ['data-theme'] });
        }
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
          const html = DOMPurify.sanitize(data.html ?? '', { USE_PROFILES: { html: true }, FORBID_TAGS: ['img', 'a', 'style'] });
          const snapshot = convertClipboardHtmlToDocumentData(html);
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
      if (!controller.signal.aborted) worker.postMessage({ bytes, name: resource.name, kind: resource.kind }, [bytes]);
    }).catch(fail);
    return () => { controller.abort(); window.clearTimeout(timeout); worker.terminate(); themeObserver?.disconnect(); container.remove(); if (dispose) queueMicrotask(dispose); };
  }, [resource.url, resource.name, resource.kind, language, onError]);
  return <div className="office-preview">
    {loading && <p className="office-loading" role="status">{language === 'zh' ? '正在加载…' : 'Loading…'}</p>}
    <div ref={host} className="office-canvas" aria-label={resource.name} inert={loading} aria-busy={loading} />
  </div>;
}
