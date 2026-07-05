/**
 * token-local-route -- HTTP 代理服务器
 *
 * 监听配置的端口，接收 AI 工具的 API 请求，
 * 转发到 DeepSeek API，并回调通知统计收集器。
 *
 * 支持流式 (SSE) 和非流式两种模式，
 * 自动检测 stream: true/false 并做相应处理。
 */

import http from 'node:http';
import { forwardRequest } from './forwarder.js';
import type { Config } from '../config.js';

// ============================================================================
// 类型定义
// ============================================================================

/** 请求记录 -- 写入统计的完整数据结构 */
export interface RequestRecord {
  timestamp: number;
  model: string;
  provider: string;
  stream: number;          // 0 = non-streaming, 1 = streaming
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

// ============================================================================
// 常量
// ============================================================================

/** CORS 响应头 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Source',
  'Access-Control-Max-Age': '86400',
};

/** 流式响应 (SSE) 的 Content-Type */
const SSE_CONTENT_TYPE = 'text/event-stream';

/** 代理服务器识别的有效路径前缀 -- OpenAI 兼容 API 路径 */
const VALID_PATH_PREFIXES = ['/v1/'];

// ============================================================================
// Proxy Server
// ============================================================================

/**
 * 创建代理服务器（不启动，由调用方 .listen()）。
 *
 * 处理流程：
 *   1. CORS 预检 (OPTIONS) -- 直接返回 200
 *   2. 路径校验 -- 非 /v1/* 返回 404
 *   3. 收集请求体
 *   4. 判断是否为流式请求
 *   5. 流式：先发 SSE 头，然后 onStreamChunk 逐块 relay
 *   6. 非流式：收完整响应后统一写回头和 body
 *   7. 构建 RequestRecord 并回调 onRequestComplete
 *
 * @param config             应用配置
 * @param onRequestComplete  请求完成后的回调，用于写入统计 + WebSocket 推送
 * @returns http.Server 实例
 */
export function createProxyServer(
  config: Config,
  onRequestComplete: (record: RequestRecord) => void,
): http.Server {
  const server = http.createServer((req, res) => {
    const requestStartTime = Date.now();
    const method = req.method || 'GET';
    const url = req.url || '/';
    const timestamp = new Date().toISOString();

    // -- 日志：记录每个请求 --
    console.log(`[proxy] ${timestamp} ${method} ${url}`);

    // ==================================================================
    // 1. CORS 预检请求 (OPTIONS)
    // ==================================================================
    if (method === 'OPTIONS') {
      res.writeHead(200, CORS_HEADERS);
      res.end();
      console.log(
        `[proxy] ${new Date().toISOString()} OPTIONS ${url} -> 200 (CORS preflight)`,
      );
      return;
    }

    // ==================================================================
    // 2. 路径校验 -- 只代理 OpenAI 兼容路径 (/v1/*)
    // ==================================================================
    const isValidPath = VALID_PATH_PREFIXES.some((prefix) =>
      url.startsWith(prefix),
    );
    if (!isValidPath) {
      const body = JSON.stringify({ error: 'Not found', path: url });
      res.writeHead(404, {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
      });
      res.end(body);
      console.log(
        `[proxy] ${new Date().toISOString()} ${method} ${url} -> 404 (unknown path)`,
      );
      return;
    }

    // ==================================================================
    // 3. 收集完整请求体
    // ==================================================================
    const bodyChunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      bodyChunks.push(chunk);
    });

    req.on('end', async () => {
      const rawBody = Buffer.concat(bodyChunks).toString('utf-8');
      const body = rawBody || null;

      // 判断是否为流式请求 (stream: true)
      const isStream = isStreamBody(body);

      try {
        let result;

        if (isStream) {
          // ---- 流式模式 ----
          // 先发送 SSE 响应头，然后通过 onStreamChunk 逐块 relay 给客户端。
          // 注意：流式模式下上游的状态码无法在 relay 前获取，
          // 统一回复 200 + SSE Content-Type，上游错误会被记录但不会回写给客户端。
          res.writeHead(200, {
            'Content-Type': SSE_CONTENT_TYPE,
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            ...CORS_HEADERS,
          });

          result = await forwardRequest(
            method,
            url,
            flattenHeaders(req.headers),
            body,
            (chunk: string) => {
              // 逐块 relay 到客户端，检查 writableEnded 防止写入已关闭的流
              if (!res.writableEnded) {
                res.write(chunk);
              }
            },
          );

          // 流式结束，关闭客户端连接
          if (!res.writableEnded) {
            res.end();
          }
        } else {
          // ---- 非流式模式 ----
          // 等待上游完整响应，然后将状态码、头、body 一并写回客户端
          result = await forwardRequest(
            method,
            url,
            flattenHeaders(req.headers),
            body,
          );

          // 过滤 transfer-encoding (Node.js http.ServerResponse 自动处理)
          const respHeaders: Record<string, string> = {};
          for (const [key, value] of Object.entries(result.headers)) {
            if (key.toLowerCase() !== 'transfer-encoding') {
              respHeaders[key] = value;
            }
          }

          res.writeHead(result.statusCode || 502, respHeaders);

          if (result.body) {
            res.write(result.body);
          }

          if (!res.writableEnded) {
            res.end();
          }
        }

        // ================================================================
        // 4. 构建请求记录并调用回调
        // ================================================================
        const record: RequestRecord = {
          timestamp: requestStartTime,
          model: result.tokens?.model || extractModelFromBody(body),
          provider: 'deepseek',
          stream: isStream ? 1 : 0,
          status_code: result.statusCode,
          input_tokens: result.tokens?.input_tokens || 0,
          output_tokens: result.tokens?.output_tokens || 0,
          cache_read_tokens: result.tokens?.cache_read_tokens || 0,
          cache_write_tokens: result.tokens?.cache_write_tokens || 0,
          total_tokens:
            (result.tokens?.input_tokens || 0) +
            (result.tokens?.output_tokens || 0),
          latency_ms: result.timing.totalMs,
          ttfb_ms: result.timing.ttfbMs,
          cost_usd: 0, // 由 collector 在回调中根据定价计算
          error_type: result.errorType,
          endpoint: url.split('?')[0], // 去掉查询参数，保留路径
          app_source: detectAppSource(req.headers),
        };

        onRequestComplete(record);

        // -- 日志：请求完成 --
        const elapsed = result.timing.totalMs;
        const tokSummary = `${record.input_tokens}+${record.output_tokens}=${record.total_tokens}`;
        console.log(
          `[proxy] ${new Date().toISOString()} ${method} ${url} ` +
            `-> ${result.statusCode} ${elapsed}ms | ${tokSummary} tokens`,
        );
      } catch (err) {
        const errorMessage = (err as Error).message;
        console.error(
          `[proxy] ${new Date().toISOString()} ${method} ${url} error: ${errorMessage}`,
        );

        if (!res.headersSent) {
          res.writeHead(502, {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
          });
        }

        if (!res.writableEnded) {
          res.end(
            JSON.stringify({ error: 'Proxy error', detail: errorMessage }),
          );
        }
      }
    });
  });

  return server;
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 将 IncomingHttpHeaders 转换为扁平的 Record<string, string>。
 *
 * Node.js 的 IncomingHttpHeaders 可能包含 string | string[] | undefined 的值，
 * 这里统一处理为逗号分隔的字符串，方便转发。
 */
function flattenHeaders(
  headers: http.IncomingHttpHeaders,
): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      flat[key] = Array.isArray(value) ? value.join(', ') : value;
    }
  }
  return flat;
}

/**
 * 从请求体 JSON 中提取 model 字段。
 *
 * @param body - 请求体 JSON 字符串 (可能为 null)
 * @returns model 名称，无法解析时返回 'unknown'
 */
function extractModelFromBody(body: string | null): string {
  if (!body) return 'unknown';
  try {
    const json = JSON.parse(body);
    return json.model || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * 检查请求体是否包含 "stream": true，判断是否为流式请求。
 *
 * @param body - 请求体 JSON 字符串 (可能为 null)
 * @returns true 如果 body 包含 stream: true
 */
function isStreamBody(body: string | null): boolean {
  if (!body) return false;
  try {
    const json = JSON.parse(body);
    return json.stream === true;
  } catch {
    return false;
  }
}

/**
 * 根据 HTTP 头检测请求来自哪个 AI 工具。
 *
 * 检测策略（按优先级）：
 *   1. x-app-source 自定义头 -- 最精确，由客户端主动设置
 *   2. User-Agent 特征匹配 -- 兜底方案，根据常见工具 UA 特征推断
 *
 * @param headers - 请求的 HTTP 头
 * @returns 应用来源标识 ('claude-code' | 'opencode' | 'cursor' | 'codebuddy' | 'continue' | 'other')
 */
function detectAppSource(headers: http.IncomingHttpHeaders): string {
  // 自定义头优先，由客户端主动声明自己的身份
  const appSource = headers['x-app-source'] as string | undefined;
  if (appSource) return appSource;

  // User-Agent 特征匹配
  const ua = (headers['user-agent'] as string || '').toLowerCase();

  if (
    ua.includes('claude-code') ||
    ua.includes('claudecli') ||
    ua.includes('anthropic')
  ) {
    return 'claude-code';
  }
  if (ua.includes('opencode') || ua.includes('codex')) {
    return 'opencode';
  }
  if (ua.includes('cursor') || ua.includes('cursor-ai')) {
    return 'cursor';
  }
  if (ua.includes('codebuddy')) {
    return 'codebuddy';
  }
  if (ua.includes('continue') || ua.includes('continue-dev')) {
    return 'continue';
  }

  return 'other';
}
