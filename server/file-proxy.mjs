import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import ipaddr from 'ipaddr.js';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const failure = (status, message) => Object.assign(new Error(message), { status });

export function fileUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw failure(400, 'INVALID_URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) throw failure(400, 'INVALID_URL');
  return url;
}

export async function publicAddress(host, resolve = lookup) {
  const hostname = host.replace(/^\[|\]$/g, '');
  const addresses = ipaddr.isValid(hostname)
    ? [{ address: hostname, family: ipaddr.parse(hostname).kind() === 'ipv4' ? 4 : 6 }]
    : await resolve(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => ipaddr.process(address).range() !== 'unicast')) throw failure(403, 'PUBLIC_ADDRESS_REQUIRED');
  return addresses[0];
}

/** Optional trusted resolver for networks that rewrite DNS to synthetic addresses. */
export function httpsDnsLookup(endpoint) {
  const base = new URL(endpoint);
  if (base.protocol !== 'https:') throw new Error('HTTPS_DNS_REQUIRED');
  return async hostname => {
    const answers = await Promise.all([1, 28].map(async type => {
      const url = new URL(base);
      url.searchParams.set('name', hostname);
      url.searchParams.set('type', String(type));
      const response = await fetch(url, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw failure(502, 'DNS_FAILED');
      const result = await response.json();
      if (result.Status !== 0) throw failure(502, 'DNS_FAILED');
      return (result.Answer ?? []).filter(answer => answer.type === type).map(answer => ({ address: answer.data, family: type === 1 ? 4 : 6 }));
    }));
    return answers.flat();
  };
}

export function fileSizeLimit(onProgress = () => {}) {
  let size = 0;
  return new Transform({ transform(chunk, _encoding, done) {
    size += chunk.length;
    onProgress();
    done(size > MAX_FILE_BYTES ? failure(413, 'FILE_TOO_LARGE') : null, chunk);
  } });
}

async function remoteFile(url, signal, resolve, redirects = 0, method = 'GET') {
  const address = await publicAddress(url.hostname, resolve);
  signal.throwIfAborted();
  const response = await new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      signal, agent: false, method,
      // Pin the validated DNS answer to the connection; never resolve it twice.
      lookup: (_host, options, done) => options.all ? done(null, [address]) : done(null, address.address, address.family),
      headers: { accept: '*/*', 'accept-encoding': 'identity', 'user-agent': 'JsonSage-FilePreview/1.0' },
    }, resolve);
    request.on('error', reject);
    request.end();
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
    response.destroy();
    if (redirects >= 3 || !response.headers.location) throw failure(502, 'INVALID_REDIRECT');
    return remoteFile(fileUrl(new URL(response.headers.location, url).href), signal, resolve, redirects + 1, method);
  }
  if (method === 'HEAD' && [405, 501].includes(response.statusCode)) { response.destroy(); return remoteFile(url, signal, resolve, redirects, 'GET'); }
  if (response.statusCode !== 200) { response.destroy(); throw failure(502, 'UPSTREAM_FAILED'); }
  if (Number(response.headers['content-length']) > MAX_FILE_BYTES) { response.destroy(); throw failure(413, 'FILE_TOO_LARGE'); }
  if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') { response.destroy(); throw failure(502, 'UNSUPPORTED_ENCODING'); }
  return { response, url };
}

/** Only descriptive metadata is exposed; the binary endpoint remains an attachment. */
export function previewMetadata(headers, url) {
  const disposition = headers['content-disposition'] ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  let name = /filename="([^"]+)"|filename=([^;]+)/i.exec(disposition)?.slice(1).find(Boolean)?.trim();
  try { name = encoded ? decodeURIComponent(encoded) : name; } catch { /* Use the plain filename. */ }
  if (!name) { try { name = decodeURIComponent(url.pathname.split('/').at(-1)); } catch { name = url.hostname; } }
  return { contentType: (headers['content-type'] ?? '').split(';')[0].trim().toLowerCase(), name: (name || url.hostname).split(/[\\/]/).at(-1) };
}

/** Same handler in Vite and production. No cookies, auth headers or disk cache. */
export function createFileProxy({ resolve = lookup } = {}) {
  let active = 0;
  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const cancel = () => { if (!response.writableFinished) controller.abort(); };
    response.on('close', cancel);
    try {
      if (request.method !== 'GET') throw failure(405, 'GET_REQUIRED');
      if (request.headers['sec-fetch-site'] === 'cross-site' ||
        (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host)) throw failure(403, 'SAME_ORIGIN_REQUIRED');
      if (active >= 8) throw failure(503, 'PREVIEW_BUSY');
      const params = new URL(request.url, 'http://localhost').searchParams;
      const target = fileUrl(params.get('url'));
      const metadata = params.get('metadata') === '1';
      active++;
      try {
        const { response: upstream, url } = await remoteFile(target, controller.signal, resolve, 0, metadata ? 'HEAD' : 'GET');
        if (metadata) {
          upstream.destroy();
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify(previewMetadata(upstream.headers, url)));
          return;
        }
        response.setHeader('Content-Type', 'application/octet-stream');
        response.setHeader('Content-Disposition', 'attachment');
        await pipeline(upstream, fileSizeLimit(() => timeout.refresh()), response, { signal: controller.signal });
      } finally { active--; }
    } catch (error) {
      if (!response.headersSent && !response.destroyed) {
        response.statusCode = error.status ?? (controller.signal.aborted ? 504 : 502);
        response.end(error.status ? error.message : 'FILE_FETCH_FAILED');
      } else response.destroy();
    } finally { clearTimeout(timeout); response.off('close', cancel); }
  };
}
