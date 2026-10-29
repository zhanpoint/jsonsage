import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { test } from 'node:test';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { createFileProxy, fileUrl, publicAddress, fileSizeLimit, MAX_FILE_BYTES, previewMetadata } from './file-proxy.mjs';

test('metadata retains MIME type and decodes safe filename hints', () => {
  assert.deepEqual(previewMetadata({ 'content-type': 'Application/PDF; charset=binary', 'content-disposition': "attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.pdf" }, new URL('https://example.com/download')), { contentType: 'application/pdf', name: '报告.pdf' });
  assert.equal(previewMetadata({ 'content-disposition': 'attachment; filename="../report.xlsx"' }, new URL('https://example.com/download')).name, 'report.xlsx');
  assert.equal(previewMetadata({}, new URL('https://example.com/%E5%9B%BE%E7%89%87')).name, '图片');
});

test('metadata probes with HEAD, follows redirects, and cancels GET fallback bodies', async t => {
  const methods = [];
  let destroyed = 0;
  t.mock.method(https, 'request', (url, options, callback) => {
    methods.push(options.method);
    const request = new EventEmitter();
    request.end = () => {
      const upstream = new Readable({ read() { throw new Error('Metadata must not consume file bytes'); } });
      upstream.on('close', () => destroyed++);
      upstream.statusCode = url.pathname === '/redirect' ? 302 : options.method === 'HEAD' ? 405 : 200;
      upstream.headers = upstream.statusCode === 302 ? { location: '/download' } : { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="report.pdf"' };
      callback(upstream);
    };
    return request;
  });
  syncBuiltinESMExports();
  const handler = createFileProxy({ resolve: async () => [{ address: '104.18.22.19', family: 4 }] });
  const server = createServer((req, res) => { void handler(req, res); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/?metadata=1&url=https://example.com/redirect`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { contentType: 'application/pdf', name: 'report.pdf' });
    assert.deepEqual(methods, ['HEAD', 'HEAD', 'GET']);
    assert.equal(destroyed, 3);
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});

test('only public HTTP(S) destinations; reject credentials, ports and local/mapped IPs', async () => {
  for (const url of ['file:///D:/a.pdf', 'ftp://example.com/a', 'https://u:p@example.com/a', 'http://example.com:8080/a']) assert.throws(() => fileUrl(url));
  assert.equal(fileUrl('https://example.com/a?token=abc').search, '?token=abc');
  for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.0.1', '198.18.1.1', '::1', 'fc00::1', '::ffff:127.0.0.1']) await assert.rejects(publicAddress(ip), /PUBLIC_ADDRESS_REQUIRED/);
  await assert.rejects(publicAddress('example.com', async () => [{ address: '104.18.22.19', family: 4 }, { address: '10.0.0.1', family: 4 }]), /PUBLIC_ADDRESS_REQUIRED/);
  const address = { address: '104.18.22.19', family: 4 };
  assert.deepEqual(await publicAddress('example.com', async () => [address]), address);
});

test('stream limit rejects oversized bodies without buffering the file', async () => {
  const chunk = Buffer.alloc(1024 * 1024);
  let progress = 0;
  await assert.rejects(pipeline(Readable.from((function* () { for (let size = 0; size <= MAX_FILE_BYTES; size += chunk.length) yield chunk; })()), fileSizeLimit(() => progress++), new Writable({ write(_chunk, _encoding, done) { done(); } })), /FILE_TOO_LARGE/);
  assert.equal(progress, 21);
});

test('HTTP handler rejects cross-site use, unsupported methods and private destinations', async () => {
  const handler = createFileProxy();
  const server = createServer((req, res) => { void handler(req, res); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/?url=http://127.0.0.1/`)).status, 403);
    assert.equal((await fetch(`${base}/?url=https://example.com/`, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
    assert.equal((await fetch(`${base}/?url=https://example.com/`, { method: 'POST' })).status, 405);
    const result = await fetch(`${base}/?url=file:///D:/a.pdf`);
    assert.equal(result.status, 400);
    assert.equal(result.headers.get('cache-control'), 'no-store');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
