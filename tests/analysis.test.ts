import assert from 'node:assert/strict';
import { analyze, RESULT_LIMIT, preview } from '../src/lib/json/analysis';
import { importRequest } from '../src/lib/importDocument';

const source = JSON.stringify({ store: { book: [{ author: 'A' }, { author: 'B' }] } });
const query = analyze({ kind: 'query', source, expression: '$.store.book[*].author', jsonc: false });
assert.equal(query.kind, 'query');
assert.deepEqual(query.rows.map(row => 'value' in row && row.value), ['"A"', '"B"']);
const capped = analyze({ kind: 'query', source: JSON.stringify(Array.from({ length: RESULT_LIMIT + 1 }, (_, i) => i)), expression: '$[*]', jsonc: false });
assert.equal(capped.rows.length, RESULT_LIMIT);
assert.ok(capped.kind === 'query' && capped.truncated);
assert.throws(() => analyze({ kind: 'query', source, expression: '$..[?(@.x)]', jsonc: false }));
assert.ok(preview({ a: 'x'.repeat(1000000) }).length < 400);
const changes = analyze({ kind: 'diff', source: '{"same":1,"old":true,"change":2}', other: '{"change":3,"same":1,"new":null}', jsonc: false });
assert.ok(changes.kind === 'diff');
assert.deepEqual(changes.rows.map(row => row.kind).sort(), ['CHANGE', 'CREATE', 'REMOVE']);
assert.ok(changes.left.every(mark => mark.to > mark.from));
const reordered = analyze({ kind: 'diff', source: '{"a":1,"b":2}', other: '{"b":2,"a":1}', jsonc: false });
assert.equal(reordered.rows.length, 0);
const reserved = analyze({ kind: 'diff', source: '{"constructor":1,"__proto__":2}', other: '{}', jsonc: false });
assert.equal(reserved.rows.length, 2);
assert.equal(analyze({ kind: 'diff', source: 'null', other: '[]', jsonc: false }).rows.length, 1);
assert.equal(analyze({ kind: 'query', source: '{/*local*/"a":1,}', expression: '$.a', jsonc: true }).rows.length, 1);
assert.throws(() => analyze({ kind: 'diff', source: '{', other: '{}', jsonc: false }));
for (const source of ['null', 'false', '0', '""', 'true', '18446744073709551615', '"root"']) {
  const result = analyze({ kind: 'query', source, expression: '$', jsonc: false });
  assert.equal(result.rows.length, 1, `Root JSONPath should support ${source}`);
  assert.equal(result.rows[0].path, '$');
}
assert.equal(analyze({ kind: 'query', source: '{"a":1}', expression: '$^', jsonc: false }).rows.length, 0, 'A root adapter must not expose artificial parents');
const request = importRequest('curl "https://example.com/data" -H "Accept: application/json" -X GET -L');
assert.equal(request.url, 'https://example.com/data');
assert.equal(request.headers.get('Accept'), 'application/json');
assert.throws(() => importRequest('curl https://example.com -X POST'));
assert.throws(() => importRequest('curl https://example.com; echo token'));
assert.throws(() => importRequest('curl $TOKEN'));
assert.throws(() => importRequest('file:///etc/passwd'));
console.log('JSONPath, bounded results, semantic diff and safe GET import checks passed.');
