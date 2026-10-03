import assert from 'node:assert/strict';
import { beautifyJson, minifyJson, escapeJsonText, unescapeJsonText } from '../src/lib/json/transforms';
import { validate } from '../src/lib/json/engine';

const original = '{"n":9007199254740993123456789,"a":1,"a":2,"text":" a  b ","list":[true,null]}';
for (const indent of ['2', '4', 'tab'] as const) {
  const formatted = beautifyJson(original, indent);
  assert.ok(formatted.ok);
  if (!formatted.ok) continue;
  const prefix = indent === 'tab' ? '\t' : ' '.repeat(Number(indent));
  assert.ok(formatted.source.includes(`\n${prefix}"n"`));
  assert.ok(formatted.source.includes('9007199254740993123456789'));
  assert.equal((formatted.source.match(/"a"/g) ?? []).length, 2);
  assert.deepEqual(minifyJson(formatted.source), { ok: true, source: original });
}
const jsonc = '// header\n{ "a": 1, /* note */ "b": [2,], }';
assert.equal(beautifyJson(jsonc).ok, false);
assert.equal(minifyJson(jsonc).ok, false);
const formattedC = beautifyJson(jsonc, '4', { mode: 'jsonc' });
assert.ok(formattedC.ok && formattedC.source.includes('// header') && formattedC.source.includes('/* note */'));
const compactC = minifyJson(jsonc, { mode: 'jsonc' });
assert.ok(compactC.ok);
if (compactC.ok) {
  assert.equal(compactC.source, '// header\n{"a":1,/* note */"b":[2,],}');
  assert.equal(validate(compactC.source, { mode: 'jsonc' }).ok, true);
}
for (const text of [original, '  中文😀\n\t"x"\\path  ', '', '"already quoted"']) {
  assert.deepEqual(unescapeJsonText(escapeJsonText(text)), { ok: true, source: text });
}
assert.deepEqual(unescapeJsonText('{\\"a\\":1}'), { ok: true, source: '{"a":1}' });
assert.equal(unescapeJsonText('bad\\q').ok, false);
assert.equal(unescapeJsonText('{"a":1}').ok, false);
assert.deepEqual(beautifyJson('{broken'), { ok: false, source: '{broken' });
// Round-trip a wider range of scalar roots, nested documents and escape sequences.
for (const source of ['null', 'true', '42', '"a \\t b"', '[]', '{}', '{"list":[{"s":"a\\\\b"},[1,2]],"x":-1.2e+3}']) {
  for (const indent of ['2', '4', 'tab'] as const) {
    const pretty = beautifyJson(source, indent);
    assert.ok(pretty.ok);
    if (pretty.ok) {
      assert.ok(validate(pretty.source).ok);
      const compact = minifyJson(pretty.source);
      assert.ok(compact.ok);
      if (compact.ok) assert.deepEqual(JSON.parse(compact.source), JSON.parse(source));
      assert.deepEqual(beautifyJson(pretty.source, indent), pretty);
    }
  }
}
for (const source of ['{', '{"a":}', '[1,,2]', '{"a":1,}', 'true false', '']) {
  assert.deepEqual(minifyJson(source), { ok: false, source });
  assert.deepEqual(beautifyJson(source), { ok: false, source });
}
console.log('Beautify, minify, escape and indentation checks passed.');
