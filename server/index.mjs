import { createServer } from 'node:http';
import { createFileProxy, httpsDnsLookup } from './file-proxy.mjs';

const proxy = createFileProxy({ resolve: process.env.PREVIEW_DNS_OVER_HTTPS ? httpsDnsLookup(process.env.PREVIEW_DNS_OVER_HTTPS) : undefined });
const server = createServer({ requestTimeout: 35_000, headersTimeout: 10_000 }, (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/healthz') { response.end('ok\n'); return; }
  if (path === '/api/preview') { void proxy(request, response); return; }
  response.writeHead(404).end();
});
server.maxConnections = 32;
server.listen(8081, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
