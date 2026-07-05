/**
 * token-local-route — LLM API 本地代理中转站
 *
 * 主入口：启动统一的 HTTP 服务器，承载：
 *   - API 代理转发 (→ DeepSeek)
 *   - REST API (/api/*)
 *   - WebSocket (/ws) 实时推送
 *   - 后台：统计聚合器 + 测速器
 */

import http from 'node:http';
import { getDb, closeDb } from './db/connection.js';
import { getConfig } from './config.js';
import { createProxyServer } from './proxy/server.js';
import { insertRequest, getPricing } from './stats/collector.js';
import { startAggregator, stopAggregator } from './stats/aggregator.js';
import { startSpeedTester, stopSpeedTester } from './speed/tester.js';
import { createApiRouter } from './api/routes.js';
import { createWSServer } from './api/ws.js';
import type { RequestRecord } from './proxy/server.js';

// ============================================================================
// 初始化
// ============================================================================
const config = getConfig();
const db = getDb();

console.log('[token-local-route] Configuration loaded');
console.log(`  Proxy:    ${config.proxy.host}:${config.proxy.port}`);
console.log(`  Target:   ${config.target.baseUrl}`);
console.log(`  API Key:  ${config.target.apiKey ? `configured (${config.target.apiKey.slice(0, 10)}...)` : 'NOT CONFIGURED — will forward auth from clients'}`);
console.log(`  Speed:    ${config.speedTest.enabled ? `every ${config.speedTest.intervalMs / 1000}s` : 'disabled'}`);

// ============================================================================
// 代理请求完成回调 — 写统计 + WebSocket 推送
// ============================================================================
let broadcastWs: ((data: unknown) => void) | null = null;

function onRequestComplete(record: RequestRecord): void {
  try {
    // 计算费用
    const pricing = getPricing(db, record.model);
    if (pricing) {
      record.cost_usd =
        record.input_tokens * pricing.input_price +
        record.output_tokens * pricing.output_price;
    }

    // 写入 SQLite
    insertRequest(db, record);

    // WebSocket 推送
    if (broadcastWs) {
      broadcastWs({ type: 'new_request', data: record });
    }
  } catch (err) {
    console.error('[token-local-route] onRequestComplete error:', err);
  }
}

// ============================================================================
// 构建请求处理链
// ============================================================================
const proxyServer = createProxyServer(config, onRequestComplete);
const apiRouter = createApiRouter(db);

/**
 * 统一的 HTTP 请求处理器 — 按路径分发
 *   /api/*  → REST API (Hono)
 *   /ws     → WebSocket upgrade (由 ws 库的 WebSocketServer 处理)
 *   /*      → 代理转发到 DeepSeek
 */
function requestHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url || '/';

  // CORS 头 — 所有响应统一设置
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-App-Source');

  // OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // /health → 内置健康检查（绕过 Hono，避免 URL 路由问题）
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: Math.floor(process.uptime()), version: '1.0.0' }));
    return;
  }

  // /api/* → REST API（构造标准 Request 对象以兼容 Hono）
  if (url.startsWith('/api/')) {
    // 将 Node.js IncomingMessage 转换为 Web 标准 Request
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    }
    const honoReq = new Request(`http://${req.headers.host || '127.0.0.1'}${url}`, {
      method: req.method || 'GET',
      headers,
    });

    Promise.resolve(apiRouter.fetch(honoReq)).then((honoRes: Response) => {
      // 将 Hono Response 转换为 Node.js response
      honoRes.headers.forEach((value: string, key: string) => {
        if (key.toLowerCase() !== 'access-control-allow-origin') {
          res.setHeader(key, value);
        }
      });
      res.statusCode = honoRes.status;
      honoRes.text().then((body: string) => {
        res.end(body);
      });
    }).catch((err: Error) => {
      console.error('[api] Error:', err.message);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }

  // 其他所有请求 → 代理转发 (通过 emit 触发 http.createServer 回调)
  proxyServer.emit('request', req, res);
}

// ============================================================================
// 启动 HTTP Server
// ============================================================================
const httpServer = http.createServer(requestHandler);

// 先启动 HTTP 服务器，再挂载 WebSocket（ws 库需要 server 已创建）
httpServer.listen(config.proxy.port, config.proxy.host, () => {
  console.log(`\n🚀 [token-local-route] Server started on http://${config.proxy.host}:${config.proxy.port}`);
  console.log('   Proxy:     http://127.0.0.1:12370/*         → DeepSeek API');
  console.log('   API:       http://127.0.0.1:12370/api/*      → REST API');
  console.log('   WebSocket: ws://127.0.0.1:12370/ws           → real-time push');
  console.log('   Dashboard: http://localhost:5173              (pnpm dev)\n');
});

// ============================================================================
// WebSocket Server
// ============================================================================
const wsServer = createWSServer(httpServer);
broadcastWs = wsServer.broadcast;
console.log('[token-local-route] WebSocket server ready at /ws');

// ============================================================================
// 后台任务
// ============================================================================

// 统计聚合器 (每 60 秒)
const aggregatorTimer = startAggregator(db);
console.log('[token-local-route] Stats aggregator started (interval: 60s)');

// 实时测速器
let speedTimer: NodeJS.Timeout | null = null;
if (config.speedTest.enabled) {
  speedTimer = startSpeedTester(db, config);
}

// ============================================================================
// 优雅关闭
// ============================================================================
function shutdown(): void {
  console.log('\n[token-local-route] Shutting down...');
  stopAggregator(aggregatorTimer);
  if (speedTimer) stopSpeedTester(speedTimer);

  // 关闭 WebSocket 连接
  wsServer.wss.close();

  httpServer.close(() => {
    console.log('[token-local-route] HTTP server closed');
    closeDb();
    console.log('[token-local-route] Goodbye!');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[token-local-route] Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
