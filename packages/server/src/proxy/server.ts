/**
 * HTTP 代理服务器 — 请求鉴权 + 按模型路由转发
 */

import http from 'node:http';
import { getConfig } from '../config.js';
import { forwardRequest } from './forwarder.js';

export interface RequestRecord {
  timestamp: number;
  model: string;
  provider: string;
  stream: number;
  status_code: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_tokens: number;
  latency_ms: number;
  ttfb_ms: number;
  cost_usd: number;
  error_type: string | null;
  endpoint: string;
  app_source: string;
}

export function createProxyServer(
  onRequestComplete: (record: RequestRecord) => void,
): http.Server {
  const config = getConfig();

  return http.createServer((req, res) => {
    const startTime = Date.now();
    const method = req.method || 'GET';
    const url = req.url || '/';

    if (method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Source',
      });
      res.end();
      return;
    }

    // 路径校验
    if (!url.startsWith('/v1/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // ---- 鉴权：检查 proxyKey ----
    const auth = req.headers['authorization'] || '';
    if (!auth.startsWith('Bearer ') || auth.slice(7) !== config.proxyKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized — check your proxy API key' }));
      console.log(`[proxy] 401 ${method} ${url} — invalid proxy key`);
      return;
    }

    console.log(`[proxy] ${method} ${url}`);

    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));

    req.on('end', async () => {
      const rawBody = Buffer.concat(chunks).toString('utf-8');
      const body = rawBody || null;
      const isStream = isStreamBody(body);

      try {
        if (isStream) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });
        }

        const result = await forwardRequest(
          method, url, flattenHeaders(req.headers), body,
          isStream ? (chunk: string) => { if (!res.writableEnded) res.write(chunk); } : undefined,
        );

        if (!isStream) {
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(result.headers)) {
            if (k.toLowerCase() !== 'transfer-encoding') h[k] = v;
          }
          res.writeHead(result.statusCode || 502, h);
          if (result.body) res.write(result.body);
        }

        if (!res.writableEnded) res.end();

        const record: RequestRecord = {
          timestamp: startTime,
          model: result.tokens?.model || extractModel(body),
          provider: result.providerName,
          stream: isStream ? 1 : 0,
          status_code: result.statusCode,
          input_tokens: result.tokens?.input_tokens || 0,
          output_tokens: result.tokens?.output_tokens || 0,
          cache_read_tokens: result.tokens?.cache_read_tokens || 0,
          cache_write_tokens: result.tokens?.cache_write_tokens || 0,
          total_tokens: (result.tokens?.input_tokens || 0) + (result.tokens?.output_tokens || 0),
          latency_ms: result.timing.totalMs,
          ttfb_ms: result.timing.ttfbMs,
          cost_usd: 0,
          error_type: result.errorType,
          endpoint: url.split('?')[0],
          app_source: detectAppSource(req.headers),
        };

        onRequestComplete(record);

        console.log(`[proxy] ${method} ${url} -> ${result.providerName} ${result.statusCode} ${result.timing.totalMs}ms | ${record.input_tokens}+${record.output_tokens}=${record.total_tokens}tok`);
      } catch (err) {
        console.error(`[proxy] Error ${method} ${url}:`, (err as Error).message);
        if (!res.headersSent) res.writeHead(502);
        if (!res.writableEnded) res.end(JSON.stringify({ error: 'Proxy error' }));
      }
    });
  });
}

function flattenHeaders(h: http.IncomingHttpHeaders): Record<string, string> {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) if (v) r[k] = Array.isArray(v) ? v.join(', ') : v;
  return r;
}
function extractModel(body: string | null): string {
  if (!body) return 'unknown';
  try { return JSON.parse(body).model || 'unknown'; } catch { return 'unknown'; }
}
function isStreamBody(body: string | null): boolean {
  if (!body) return false;
  try { return JSON.parse(body).stream === true; } catch { return false; }
}
function detectAppSource(headers: http.IncomingHttpHeaders): string {
  const src = headers['x-app-source'] as string | undefined;
  if (src) return src;
  const ua = (headers['user-agent'] as string || '').toLowerCase();
  if (ua.includes('claude-code') || ua.includes('claudecli')) return 'claude-code';
  if (ua.includes('opencode') || ua.includes('codex')) return 'opencode';
  if (ua.includes('cursor')) return 'cursor';
  return 'other';
}
