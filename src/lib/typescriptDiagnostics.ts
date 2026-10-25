import ts from 'typescript';
import type { JsonDiagnostic } from './json/engine';

/** An in-memory compiler host keeps generated code and library resolution local. */
export function typescriptDiagnostics(source: string, libraries: Readonly<Record<string, string>>): JsonDiagnostic[] {
  const fileName = 'generated.ts';
  const files = { ...libraries, [fileName]: source };
  const options: ts.CompilerOptions = { strict: true, noEmit: true, target: ts.ScriptTarget.ES5, lib: ['lib.es5.d.ts'], skipLibCheck: true };
  const readFile = (path: string) => files[path.replace(/^.*[/\\]/, '') as keyof typeof files];
  const host: ts.CompilerHost = {
    getSourceFile: (path, version) => { const text = readFile(path); return text === undefined ? undefined : ts.createSourceFile(path, text, version, true); },
    getDefaultLibFileName: () => 'lib.es5.d.ts', writeFile: () => {}, getCurrentDirectory: () => '',
    getDirectories: () => [], fileExists: path => readFile(path) !== undefined, readFile,
    getCanonicalFileName: path => path, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
  };
  const program = ts.createProgram([fileName], options, host);
  return ts.getPreEmitDiagnostics(program).filter(issue => issue.file?.fileName === fileName).slice(0, 100).map(issue => ({
    code: `TS${issue.code}`, severity: issue.category === ts.DiagnosticCategory.Warning ? 'warning' : 'error',
    start: issue.start ?? 0, end: (issue.start ?? 0) + (issue.length ?? 1), message: ts.flattenDiagnosticMessageText(issue.messageText, '\n'),
  }));
}
