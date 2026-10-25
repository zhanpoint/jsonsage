import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { codeSyntaxDiagnostics, type CodeLanguage } from '../src/lib/codeLanguages';
import { typescriptDiagnostics } from '../src/lib/typescriptDiagnostics';
import { generateTypes } from '../src/lib/json/typeGeneration';

const require = createRequire(import.meta.url);
const libraries = Object.fromEntries(['lib.es5.d.ts', 'lib.decorators.d.ts', 'lib.decorators.legacy.d.ts'].map(name => [name, readFileSync(require.resolve(`typescript/lib/${name}`), 'utf8')]));
const input = '{"id":1,"name":"Ada","active":true,"items":[{"price":2.5}],"createdAt":"2026-10-21T00:00:00Z"}';
for (const language of ['typescript', 'python', 'go', 'rust'] as const) {
  const source = (await generateTypes(input, language, '  ')).join('\n');
  assert.deepEqual(codeSyntaxDiagnostics(source, language), [], `${language} output must parse in its own grammar`);
  if (language === 'typescript') assert.deepEqual(typescriptDiagnostics(source, libraries), [], 'Generated TypeScript must type check with arrays and Date');
}
const invalid: Record<CodeLanguage, string> = {
  typescript: 'export interface Root { name: }', python: 'def broken(:\n  pass', go: 'package main\ntype Root struct { Name } }', rust: 'struct Root { name: }',
};
for (const [language, source] of Object.entries(invalid)) assert.ok(codeSyntaxDiagnostics(source, language as CodeLanguage).length, `${language} syntax errors must be reported`);
assert.ok(typescriptDiagnostics('const value: string = 42;', libraries).some(issue => issue.code === 'TS2322'), 'Type errors must come from the TypeScript compiler');
assert.ok(typescriptDiagnostics('const value: MissingType = 42;', libraries).some(issue => issue.code === 'TS2304'));
console.log('Generated code parses in all four languages; TypeScript syntax, semantic errors, arrays and Date checks passed.');
