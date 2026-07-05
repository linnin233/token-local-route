/**
 * token-local-route — LLM API 本地代理中转站
 *
 * 接收 Claude/OpenCode 请求 → 按模型路由到对应 provider → 转发 → 记录统计
 */

import http from 'node:http';
import { getDb, closeDb } from './db/connection.js';
import { getConfig } from './config.js';
import { createProxyServer } from './proxy/server.js';
import { insertRequest, getPricing } from './stats/collector.js';
import { startAggregator, stopAggregator } from './stats/aggregator.js';
import { createApiRouter } from './api/routes.js';
import { createWSServer } from './api/ws.js';
import type { RequestRecord } from './proxy/server.js';

const config = getConfig();
const db = getDb();

console.log('[token-local-route] proxy %s:%d', config.proxy.host, config.proxy.port);
console.log('[token-local-route] proxyKey: %s', config.proxyKey);
for (const [name, p] of Object.entries(config.providers)) {
  console.log('[token-local-route] provider %s -> %s (%s) %s',
    name, p.baseUrl, p.apiType, p.apiKey ? 'key=***' : 'key=NOT SET');
}

let broadcastWs: ((data: unknown) => void) | null = null;

function onRequestComplete(record: RequestRecord): void {
  try {
    const pricing = getPricing(db, record.model);
    if (pricing) {
      record.cost_usd =
        record.input_tokens * pricing.input_price +
        record.output_tokens * pricing.output_price;
    }
    insertRequest(db, record);
    if (broadcastWs) broadcastWs({ type: 'new_request', data: record });
  } catch (err) {
    console.error('[token-local-route] onRequestComplete error:', err);
  }
}

const proxyServer = createProxyServer(onRequestComplete);
const apiRouter = createApiRouter(db);

function requestHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url || '/';
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-App-Source');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (url === '/health') { res.writeHead(200).end('ok'); return; }

  if (url.startsWith('/api/')) {
    // 收集 body 再构造 Request（否则 Hono 的 c.req.json() 拿不到数据）
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8') || undefined;
      const h = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v) h.set(k, Array.isArray(v) ? v.join(', ') : v);
      if (body) h.set('content-length', String(Buffer.byteLength(body)));
      const r = new Request(`http://${req.headers.host || '127.0.0.1'}${url}`, {
        method: req.method || 'GET', headers: h, body: body || undefined,
      });
      Promise.resolve(apiRouter.fetch(r)).then((resp: Response) => {
        resp.headers.forEach((v: string, k: string) => { if (k.toLowerCase() !== 'access-control-allow-origin') res.setHeader(k, v); });
        res.statusCode = resp.status;
        resp.text().then((b: string) => res.end(b));
      }).catch((err: Error) => { if (!res.headersSent) { res.writeHead(500); res.end(err.message); } });
    });
    return;
  }

  proxyServer.emit('request', req, res);
}

const httpServer = http.createServer(requestHandler);
httpServer.listen(config.proxy.port, config.proxy.host, () => {
  console.log('[token-local-route] listening on http://%s:%d', config.proxy.host, config.proxy.port);
});

const wsServer = createWSServer(httpServer);
broadcastWs = wsServer.broadcast;

const aggregatorTimer = startAggregator(db);

function shutdown(): void {
  stopAggregator(aggregatorTimer);
  wsServer.wss.close();
  httpServer.close(() => { closeDb(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
