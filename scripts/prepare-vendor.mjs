import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
// Convert jq-web's official modularized factory to ESM without auto-instantiating it.
// Supplying locateFile avoids bundler-dependent WASM URL resolution.
const source = await readFile(new URL('../node_modules/jq-web/jq.js', import.meta.url), 'utf8');
const boundary = source.lastIndexOf("\nif (typeof exports === 'object' && typeof module === 'object') {\n");
if (boundary < 0) throw new Error('jq-web module format changed. Review the installed source.');
const directory = new URL('../public/vendor/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('jq.mjs', directory), source.slice(0, boundary) + '\nexport default jq;\n');
await copyFile(new URL('../node_modules/jq-web/jq.wasm', import.meta.url), new URL('jq.wasm', directory));
await copyFile(new URL('../node_modules/jq-web/LICENSE', import.meta.url), new URL('jq-LICENSE.txt', directory));
