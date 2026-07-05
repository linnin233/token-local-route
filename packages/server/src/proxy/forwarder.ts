/**
 * HTTP 请求转发器
 *
 * 将收到的代理请求转发到 DeepSeek API，同时记录性能指标。
 * 使用 Node.js 内置 http/https 模块实现 raw socket 级控制，
 * 确保 SSE streaming 的零延迟 relay 和精确的 TTFB 测量。
 *
 * target base URL 从全局配置 (~/.token-local-route/config.json) 中读取，
 * 无需调用方传入。
 */

import http from 'node:http';
import https from 'node:https';
import { getConfig } from '../config.js';
import { parseNonStreamResponse, extractTokensFromSSEStream } from './parser.js';
import type { ParsedResponse } from './parser.js';

// ============================================================================
// 类型定义
// ============================================================================

/** 转发结果 */
export interface ForwardResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;                    // 非流式：完整响应 body
  streamChunks: string[];          // 流式：收集的 SSE chunks
  timing: {
    startTime: number;             // 请求开始时间戳 (ms)
    ttfbMs: number;                // Time To First Byte (ms)
    totalMs: number;               // 总耗时 (ms)
  };
  tokens: ParsedResponse | null;   // 提取的 token 用量
  errorType: string | null;        // 'timeout' | 'network' | 'rate_limit' | null
}

// ============================================================================
// 请求转发
// ============================================================================

/**
 * 转发 HTTP 请求到目标 API。
 *
 * 路径替换规则：
 *   本地路径 /v1/chat/completions → https://api.deepseek.com/v1/chat/completions
 *   同样支持 /v1/models, /v1/embeddings 等 OpenAI 兼容路径。
 *
 * @param method          HTTP 方法 (GET/POST/...)
 * @param path            请求路径 (如 /v1/chat/completions)
 * @param headers         原始请求头（Authorization、Content-Type 等原样转发）
 * @param body            请求体 (JSON 字符串 / null)
 * @param onStreamChunk   流式回调 — 每收到一个 SSE chunk 就调用，用于 relay 给客户端
 */
export async function forwardRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body: string | null,
  onStreamChunk?: (chunk: string) => void,
): Promise<ForwardResult> {
  const startTime = Date.now();
  let ttfbMs = 0;
  let firstByte = true;
  let statusCode = 0;
  let responseBody = '';
  const streamChunks: string[] = [];
  let tokens: ParsedResponse | null = null;
  let errorType: string | null = null;

  // 从全局配置中读取 target base URL
  const config = getConfig();
  const targetUrl = config.target.baseUrl;

  // 解析 target URL 并拼接完整路径
  const target = new URL(targetUrl);
  const isHttps = target.protocol === 'https:';
  const transport = isHttps ? https : http;
  const port = target.port || (isHttps ? 443 : 80);

  // 构建完整请求路径：target origin + 原始 path
  const fullPath = path;

  // 构建转发请求头 — 保留原始头但替换 host 为 target
  const forwardHeaders: Record<string, string> = {
    ...headers,
    host: target.hostname,
  };

  // 添加代理标识，方便上游识别请求来源
  forwardHeaders['x-proxy'] = 'token-local-route';

  // 判断请求体是否包含 "stream": true
  const isStream = body ? isStreamRequest(body) : false;

  // 对流式请求额外设置 Accept 头（不影响已有值）
  if (isStream && !forwardHeaders['accept']) {
    forwardHeaders['accept'] = 'text/event-stream';
  }

  // 执行转发
  return new Promise((resolve) => {
    const req = transport.request(
      {
        hostname: target.hostname,
        port,
        path: fullPath,
        method,
        headers: forwardHeaders,
        timeout: 30000, // 30 秒超时
      },
      (res) => {
        statusCode = res.statusCode || 0;

        // 收集响应头（处理重复头为逗号分隔字符串）
        const respHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(res.headers)) {
          if (value !== undefined) {
            respHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
          }
        }

        // 处理响应数据
        res.on('data', (chunk: Buffer) => {
          const chunkStr = chunk.toString('utf-8');

          // 记录 TTFB (time to first byte) — 只在首个 data 事件触发时记录
          if (firstByte) {
            ttfbMs = Date.now() - startTime;
            firstByte = false;
          }

          if (isStream && onStreamChunk) {
            // 流式模式：立即 relay 每个 chunk 给客户端，同时收集用于后续解析
            onStreamChunk(chunkStr);
            streamChunks.push(chunkStr);
          } else {
            // 非流式模式：累积完整响应体，最后统一解析
            responseBody += chunkStr;
          }
        });

        res.on('end', () => {
          const totalMs = Date.now() - startTime;

          // 解析 token 用量
          if (isStream) {
            // 流式：将所有 chunks 拼接后提取最后一个 usage 字段
            const fullStream = streamChunks.join('');
            tokens = extractTokensFromSSEStream(fullStream);
          } else {
            // 非流式：直接从完整 JSON response 中解析 usage
            tokens = parseNonStreamResponse(responseBody);
          }

          // 根据状态码识别错误类型
          if (statusCode === 429) {
            errorType = 'rate_limit';
          } else if (statusCode >= 500) {
            errorType = 'server_error';
          }

          resolve({
            statusCode,
            headers: respHeaders,
            body: responseBody,
            streamChunks,
            timing: { startTime, ttfbMs, totalMs },
            tokens,
            errorType,
          });
        });

        // 响应流错误（如中途断开）
        res.on('error', (err) => {
          errorType = 'network';
          const totalMs = Date.now() - startTime;
          if (firstByte) ttfbMs = totalMs;
          resolve({
            statusCode: 0,
            headers: {},
            body: responseBody,
            streamChunks,
            timing: { startTime, ttfbMs, totalMs },
            tokens: null,
            errorType,
          });
        });
      },
    );

    // --- 请求级超时处理 ---
    req.on('timeout', () => {
      req.destroy();
      errorType = 'timeout';
      const totalMs = Date.now() - startTime;
      resolve({
        statusCode: 0,
        headers: {},
        body: '',
        streamChunks,
        timing: { startTime, ttfbMs, totalMs },
        tokens: null,
        errorType,
      });
    });

    // --- 请求级网络错误处理 ---
    req.on('error', (err) => {
      errorType = 'network';
      const totalMs = Date.now() - startTime;
      resolve({
        statusCode: 0,
        headers: {},
        body: '',
        streamChunks,
        timing: { startTime, ttfbMs, totalMs },
        tokens: null,
        errorType,
      });
    });

    // 写入请求体（POST 等方法的 JSON payload）
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 检查请求体是否包含 "stream": true，判断是否为流式请求。
 *
 * @param body - 请求体 JSON 字符串
 * @returns true 如果 body 包含 stream: true
 */
function isStreamRequest(body: string): boolean {
  try {
    const json = JSON.parse(body);
    return json.stream === true;
  } catch {
    return false;
  }
}
