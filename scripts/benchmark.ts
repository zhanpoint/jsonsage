import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { validate } from '../src/lib/json/engine';
import { branch } from '../src/lib/json/branches';
import { largeGraph, largeTable } from '../src/lib/json/largeViews';
import { beautifyJson, minifyJson } from '../src/lib/json/transforms';
const row = '  {"id":18446744073709551615,"name":"Synthetic test","email":"demo@example.com","payload":"' + 'x'.repeat(128) + '"}';
const rows = Math.floor((100 * 1024 * 1024 - 16) / (row.length + 2));
const source = '{"items":[\n' + (row + ',\n').repeat(rows).slice(0, -2) + '\n]}';
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/performance-100m.json', source);
const report: Record<string, unknown> = { bytes: Buffer.byteLength(source), rows, node: process.version, timings: {} };
function measure(name: string, work: () => void) {
  const start = performance.now(); work();
  const elapsed = Math.round(performance.now() - start);
  (report.timings as Record<string, number>)[name] = elapsed;
  console.log(`${name}: ${elapsed} ms`);
  global.gc?.();
}
measure('validate', () => { if (!validate(source).ok) throw new Error('Invalid fixture'); });
measure('branch', () => { if (branch(source, ['items']).rows.length !== 300) throw new Error('Branch failed'); });
measure('table', () => { if (largeTable(source, ['items'], 0).total !== rows) throw new Error('Table failed'); });
measure('graph', () => { if (largeGraph(source, 3).items.length !== 300) throw new Error('Graph failed'); });
measure('minify', () => { const result = minifyJson(source); if (!result.ok || !result.source.includes('18446744073709551615')) throw new Error('Minify failed'); });
measure('format', () => { const result = beautifyJson(source, '4'); if (!result.ok || !result.source.startsWith('{\n    "items"')) throw new Error('Format failed'); });
report.peakRssMiB = Math.round(process.resourceUsage().maxRSS / 1024);
await writeFile('artifacts/benchmark-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
