import assert from 'node:assert/strict';
import { parse, tryParse, validate, diagnosticLocations, lineColumn } from '../src/lib/json/engine';

assert.equal(validate('{"valid": true}').ok, true);
assert.equal(validate('{"valid": True}').diagnostics.some((item) => item.code === 'E030'), true);
assert.equal(validate('{"value": 1,}').diagnostics.some((item) => item.code === 'E008'), true);
assert.equal(validate('{"value": 1,}', { mode: 'jsonc' }).ok, true);
assert.equal(validate('{"key": 1, "key": 2}').diagnostics.some((item) => item.code === 'W060'), true);
assert.equal(validate('{"one":{"key":1},"two":{"key":2}}').diagnostics.some((item) => item.code === 'W060'), false);
assert.equal(validate('{"text":"True,}"}').ok, true);
assert.deepEqual(parse('{"list": [1, 2]}'), { list: [1, 2] });
assert.equal(tryParse('{"value":}').ok, false);
assert.equal(validate('{"value": /* comment */ 1}', { mode: 'jsonc' }).ok, true);
console.log('JsonSage checks passed.');

// Structured diagnostics must be independent of engine-specific SyntaxError messages.
for (const [text, code] of [
  ['{"a" 1}', 'S5'], ['{"a":1 "b":2}', 'S6'],
  ['{"a":1', 'S7'], ['[1,2', 'S8'], ['{} }', 'S9'],
  ['{bare:1}', 'S1'], ['{"a":"\\q"}', 'S15'],
] as const) {
  const checked = validate(text);
  assert.equal(checked.ok, false, text);
  assert.ok(checked.diagnostics.some((item) => item.code === code), `${text}: ${JSON.stringify(checked.diagnostics)}`);
}
const missingColon = validate('{\r\n  "中😀" 1\r\n}').diagnostics.find((item) => item.code === 'S5')!;
assert.equal(missingColon.start, 11);
assert.equal(validate('{"a":1').diagnostics.find((item) => item.code === 'S7')?.start, 6);
assert.equal(validate('').ok, false);
assert.equal(validate('// hi\n{}').ok, false);
assert.equal(validate('// hi\n{}', { mode: 'jsonc' }).ok, true);
assert.equal(validate('{"n":9007199254740993123456789}').ok, true);
assert.equal(validate('{"__proto__":1}').ok, true);
assert.equal(validate('{"a" /* key comment */ :1,"a":2}', { mode: 'jsonc' }).diagnostics.some((item) => item.code === 'W060'), true);
assert.equal(validate('{"a":1,"a":2}', { duplicateKeys: 'error' }).ok, false);
assert.equal(validate('{"a":1,"a":2}', { duplicateKeys: 'allow' }).diagnostics.length, 0);
const manyWarnings = `{${Array.from({ length: 110 }, () => '"a":1').join(',')}} trailing`;
assert.equal(validate(manyWarnings).ok, false);
assert.ok(validate(manyWarnings).diagnostics.some((item) => item.severity === 'error'));
console.log('Structured diagnostic checks passed.');
for (const text of ['{\r\n  "中😀" 1\r\n}', '[\n1 2\n3 4\n]', '{\r"a" 1\r}', '"' + '\u0001'.repeat(1000) + '"']) {
  const issues = validate(text).diagnostics;
  assert.ok(issues.length <= 100, 'Malformed strings must not create an unbounded diagnostic list');
  for (const issue of diagnosticLocations(text, issues)) assert.deepEqual(issue.location, lineColumn(text, issue.start));
}
