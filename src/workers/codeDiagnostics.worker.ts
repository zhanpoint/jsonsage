import { codeSyntaxDiagnostics, type CodeLanguage } from '../lib/codeLanguages';

let latest = 0;
self.onmessage = async (event: MessageEvent<{ id: number; source: string; language: CodeLanguage }>) => {
  const { id, source, language } = event.data;
  latest = id;
  try {
    if (language !== 'typescript') { self.postMessage({ id, diagnostics: codeSyntaxDiagnostics(source, language) }); return; }
    const [{ typescriptDiagnostics }, es5, decorators, legacy] = await Promise.all([
      import('../lib/typescriptDiagnostics'), import('typescript/lib/lib.es5.d.ts?raw'),
      import('typescript/lib/lib.decorators.d.ts?raw'), import('typescript/lib/lib.decorators.legacy.d.ts?raw'),
    ]);
    if (id !== latest) return;
    self.postMessage({ id, diagnostics: typescriptDiagnostics(source, {
      'lib.es5.d.ts': es5.default, 'lib.decorators.d.ts': decorators.default, 'lib.decorators.legacy.d.ts': legacy.default,
    }) });
  } catch (error) { self.postMessage({ id, error: error instanceof Error ? error.message : 'CHECK_FAILED' }); }
};
