import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { go } from '@codemirror/lang-go';
import { rust } from '@codemirror/lang-rust';
import type { JsonDiagnostic } from './json/engine';

export type CodeLanguage = 'typescript' | 'python' | 'go' | 'rust';
const languages = { typescript: javascript({ typescript: true }), python: python(), go: go(), rust: rust() };
export function codeLanguage(language: CodeLanguage) { return languages[language]; }

export function codeSyntaxDiagnostics(source: string, language: CodeLanguage): JsonDiagnostic[] {
  const diagnostics: JsonDiagnostic[] = [];
  languages[language].language.parser.parse(source).iterate({ enter(node) {
    if (node.type.isError && diagnostics.length < 100) diagnostics.push({
      code: 'SYNTAX', severity: 'error', start: node.from, end: node.to, message: `${language}: syntax error`,
    });
  } });
  return diagnostics;
}
