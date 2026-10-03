import assert from 'node:assert/strict';
import { EditorState, type Transaction } from '@codemirror/state';
import { history, undo, redo, undoDepth, redoDepth, isolateHistory } from '@codemirror/commands';
import { diagnosticCount, setDiagnostics } from '@codemirror/lint';
import { documentChange, editorDiagnostics } from '../src/lib/codeEditor';

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
