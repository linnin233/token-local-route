/**
 * token-local-route — LLM API 本地代理中转站
 *
 * 核心功能：接收 Claude/OpenCode 的 API 请求 → 转发到 DeepSeek → 记录统计
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

console.log('[token-local-route] Proxy: %s:%d -> %s', config.proxy.host, config.proxy.port, config.target.baseUrl);

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

const proxyServer = createProxyServer(config, onRequestComplete);
const apiRouter = createApiRouter(db);

function requestHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url || '/';
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-App-Source');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (url.startsWith('/api/')) {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    }
    const honoReq = new Request(`http://${req.headers.host || '127.0.0.1'}${url}`, {
      method: req.method || 'GET', headers,
    });
    Promise.resolve(apiRouter.fetch(honoReq)).then((honoRes: Response) => {
      honoRes.headers.forEach((value: string, key: string) => {
        if (key.toLowerCase() !== 'access-control-allow-origin') res.setHeader(key, value);
      });
      res.statusCode = honoRes.status;
      honoRes.text().then((body: string) => res.end(body));
    }).catch((err: Error) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  proxyServer.emit('request', req, res);
}

const httpServer = http.createServer(requestHandler);
httpServer.listen(config.proxy.port, config.proxy.host, () => {
  console.log('[token-local-route] Listening on http://%s:%d', config.proxy.host, config.proxy.port);
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
