import assert from 'node:assert/strict';
import { repairJson } from '../src/lib/json/repair';
import { validate } from '../src/lib/json/engine';

const cases = [
  '{"a":1,}', "{'a':'hello'}", '{bare:1}', '// hi\n{"a":1}',
  '{/* hi */"a":1}', '{"a":1 "b":2}', '{"a":1', '[1,2',
  '{"a":"hello\nworld"}', '{"a":True,"b":None}',
  "{name:'demo', list:[1,2,], active:True}",
  '{"n":9007199254740993123456789,}', '{"a":1,"a":2,}',
];
for (const source of cases) {
  const result = repairJson(source);
  assert.ok(result.ok, source);
  if (result.ok) assert.ok(validate(result.source).ok, result.source);
}
const numeric = repairJson('{"n":9007199254740993123456789,}');
assert.ok(numeric.ok && numeric.source.includes('9007199254740993123456789'));
const duplicates = repairJson('{"a":1,"a":2,}');
assert.ok(duplicates.ok && duplicates.source.includes('"a":1') && duplicates.source.includes('"a":2'));
const valid = '{ "a": 1, "text": "// hi,}" }';
assert.deepEqual(repairJson(valid), { ok: true, source: valid, changed: false });
for (const source of ['', '  ', '{"a":1} xyz']) {
  const result = repairJson(source);
  assert.equal(result.ok, false, source);
  assert.equal(result.source, source);
}
const validC = '// header\n{"a":1,}';
assert.deepEqual(repairJson(validC, { mode: 'jsonc' }), { ok: true, source: validC, changed: false });
const strictRepair = repairJson(validC);
assert.ok(strictRepair.ok && validate(strictRepair.source).ok && !strictRepair.source.includes('//'));
const malformedC = "// header\n{bare:'value', /* inline */ x:True,}";
const repairC = repairJson(malformedC, { mode: 'jsonc' });
assert.ok(repairC.ok && repairC.commentsMoved);
if (repairC.ok) {
  assert.ok(repairC.source.includes('// header') && repairC.source.includes('/* inline */'));
  assert.ok(validate(repairC.source, { mode: 'jsonc' }).ok);
}
const quotedComment = repairJson("{text:'http://host/*value*/', x:1,}", { mode: 'jsonc' });
assert.ok(quotedComment.ok && !quotedComment.commentsMoved);
console.log(`Repair checks passed (${cases.length} common-error cases plus mode-specific cases).`);
