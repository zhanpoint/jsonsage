import assert from 'node:assert/strict';
import { EditorState, type Transaction } from '@codemirror/state';
import { history, undo, redo, undoDepth, redoDepth, isolateHistory } from '@codemirror/commands';
import { diagnosticCount, setDiagnostics } from '@codemirror/lint';
import { documentChange, editorDiagnostics } from '../src/lib/codeEditor';
import { httpLink } from '../src/lib/editorLinks';
import { documentSizeLimit, exceedsDocumentLimit } from '../src/lib/documentLimits';

let limitNotices = 0;
let limited = EditorState.create({ doc: '1234', extensions: [history(), documentSizeLimit(() => limitNotices++, 8)] });
limited = limited.update({ changes: { from: 4, insert: '5678' } }).state;
assert.equal(limited.doc.toString(), '12345678', 'The exact editor boundary is allowed');
const historyBeforeLimit = undoDepth(limited);
limited = limited.update({ changes: { from: 8, insert: '9' }, userEvent: 'input.paste' }).state;
assert.equal(limited.doc.toString(), '12345678');
assert.equal(limitNotices, 1);
assert.equal(undoDepth(limited), historyBeforeLimit, 'Rejected input must not enter undo history');
limited = limited.update({ changes: [{ from: 0, insert: 'a' }, { from: 8, insert: 'b' }] }).state;
assert.equal(limited.doc.toString(), '12345678', 'Multi-selection edits must obey the combined limit');
limited = limited.update({ changes: { from: 0, to: 8, insert: '{}' } }).state;
assert.equal(limited.doc.toString(), '{}', 'Replacing a selection must subtract its old length');
const oversized = EditorState.create({ doc: '123456789', extensions: documentSizeLimit(() => limitNotices++, 8) });
assert.equal(oversized.update({ changes: { from: 0, to: 1 } }).state.doc.length, 8, 'Old oversized content remains reducible');
assert.equal(exceedsDocumentLimit(4, 8, 8), false);
assert.equal(exceedsDocumentLimit(4, 9, 8), true);

for (const value of ['https://example.com/a?q=1&b=2#section', 'http://localhost:5174/path', 'HTTPS://例子.测试/图片']) {
  assert.equal(httpLink(value), new URL(value).href);
}
for (const value of ['javascript:alert(1)', 'data:text/html,test', 'file:///D:/a.json', 'https://', 'https://[invalid', 'not a URL']) assert.equal(httpLink(value), null);

const previous = '{"label":"😀","count":1}';
const next = '{"label":"😀","count":200}';
let state = EditorState.create({ doc: previous, selection: { anchor: previous.indexOf('label') }, extensions: history() });
state = state.update({ changes: documentChange(previous, next) }).state;
assert.equal(state.doc.toString(), next);
assert.equal(state.selection.main.head, previous.indexOf('label'));
const target = { get state() { return state; }, dispatch: (transaction: Transaction) => { state = transaction.state; } };
assert.equal(undo(target), true);
assert.equal(state.doc.toString(), previous);
assert.equal(redo(target), true);
assert.equal(state.doc.toString(), next);
// External toolbar operations must remain separate undo steps, even within one typing group.
const minified = '{"count":1}';
const formatted = '{\n  "count": 1\n}';
state = EditorState.create({ doc: minified, extensions: history() });
state = state.update({ changes: documentChange(minified, formatted), annotations: isolateHistory.of('full') }).state;
state = state.update({ changes: { from: state.doc.length, insert: '\n' }, userEvent: 'input.type' }).state;
assert.equal(undoDepth(state), 2);
undo(target);
assert.equal(state.doc.toString(), formatted);
undo(target);
assert.equal(state.doc.toString(), minified);
assert.equal(undoDepth(state), 0);
assert.equal(redoDepth(state), 2);
redo(target);
redo(target);
assert.equal(state.doc.toString(), formatted + '\n');
undo(target);
state = state.update({ changes: { from: 0, insert: ' ' }, userEvent: 'input.type' }).state;
assert.equal(redoDepth(state), 0);
for (const [before, after] of [['', '{}'], ['{}', ''], ['[1,2]', '[1,3,2]'], ['"😀"', '"😁"'], ['null', 'null']]) {
  const original = EditorState.create({ doc: before });
  assert.equal(original.update({ changes: documentChange(before, after) }).state.doc.toString(), after);
}
const diagnostics = editorDiagnostics([
  { start: 999, end: 1000, severity: 'error', code: 'EOF', message: 'Missing delimiter', hint: 'Close the object.' },
  { start: 0, end: 1, severity: 'warning', code: 'DUP', message: 'Duplicate key' },
], state.doc.length);
state = state.update(setDiagnostics(state, diagnostics)).state;
assert.equal(diagnosticCount(state), 2);
state = state.update({ selection: { anchor: 0, head: 1 } }).state;
assert.equal(diagnosticCount(state), 2, 'Selecting an issue must preserve diagnostics');
assert.equal(diagnostics[0].from, state.doc.length);
assert.equal(diagnostics[0].to, state.doc.length);
state = state.update(setDiagnostics(state, [])).state;
assert.equal(diagnosticCount(state), 0);
console.log('CM6 external changes, selection, undo/redo and diagnostic checks passed.');

const { indexJsonFolds, foldOnLine } = await import('../src/lib/json/foldIndex');
const indexedSource = '[\n {"escaped":"}\\\"[", "nested":[\n 1,2\n ]},\n {}\n]';
const foldRanges = indexJsonFolds(indexedSource);
assert.deepEqual(foldOnLine(foldRanges, 0, 1), { from: 1, to: indexedSource.lastIndexOf(']') });
const nested = indexedSource.indexOf('[', indexedSource.indexOf('nested'));
assert.deepEqual(foldOnLine(foldRanges, nested, nested + 1), { from: nested + 1, to: indexedSource.indexOf(']', nested) });
assert.equal(foldOnLine(foldRanges, indexedSource.lastIndexOf('{}'), indexedSource.lastIndexOf('{}') + 2), null);
const { largeJsonLanguage, foldIndex, setFoldIndex } = await import('../src/lib/largeJsonLanguage');
let indexedState = EditorState.create({ doc: indexedSource, extensions: largeJsonLanguage });
indexedState = indexedState.update({ effects: setFoldIndex.of(foldRanges) }).state;
assert.equal(indexedState.field(foldIndex), foldRanges);
indexedState = indexedState.update({ changes: { from: 0, insert: ' ' } }).state;
assert.equal(indexedState.field(foldIndex), null, 'Edits invalidate old folding offsets until the worker provides a fresh index');
console.log('Large JSON fold indexes ignore quoted delimiters and invalidate stale offsets.');

const { validate, validateIndexed } = await import('../src/lib/json/engine');
for (const text of [indexedSource, '{"x": [1,2], "x": {}}', '/* { ignored } */ {"a":[1,],}', '{"incomplete": [', '["😀", {"id":18446744073709551615}]', '[' + '{} ,'.repeat(2000) + '{}]']) {
  for (const mode of ['strict', 'jsonc'] as const) {
    const { folds, ...validation } = validateIndexed(text, { mode });
    assert.deepEqual(validation, validate(text, { mode }), 'Shared indexing must preserve diagnostics');
    assert.deepEqual(folds, indexJsonFolds(text), 'Validation and folding share original source offsets');
  }
}
console.log('Shared validation indexes preserve comments, invalid-input offsets and growing buffers.');
const mixed = '[{}, {"a":[]}, {\n "next": true\n}]';
assert.deepEqual(foldOnLine(indexJsonFolds(mixed), 1, mixed.indexOf('\n')), { from: mixed.lastIndexOf('{') + 1, to: mixed.lastIndexOf('}') });
const singleLine = '[' + '{"a":[{}]},'.repeat(10000) + '{}]';
assert.equal(foldOnLine(indexJsonFolds(singleLine), 0, singleLine.length), null);
