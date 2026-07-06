/**
 * HTTP 请求转发器 — 模型路由 + OpenAI/Anthropic 双格式支持
 */

import http from 'node:http';
import https from 'node:https';
import { getConfig, resolveProvider, resolveProviderName } from '../config.js';
import { parseNonStreamResponse, extractTokensFromSSEStream, parseAnthropicResponse, extractAnthropicTokensFromStream } from './parser.js';
import type { ParsedResponse } from './parser.js';

export interface ForwardResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  streamChunks: string[];
  timing: { startTime: number; ttfbMs: number; totalMs: number };
  tokens: ParsedResponse | null;
  errorType: string | null;
  providerName: string;
}

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
  let errorType: string | null = null;

  const config = getConfig();
  const model = extractModel(body);
  const provider = resolveProvider(config, model);
  const providerName = resolveProviderName(config, model);
  const isStream = body ? isStreamBody(body) : false;

  // ---- 格式检测：Anthropic vs OpenAI ----
  const isAnthropic = path.startsWith('/v1/messages');

  // Anthropic 格式用 anthropicUrl，否则用 baseUrl
  let baseUrl = provider.baseUrl;
  if (isAnthropic && provider.anthropicUrl) {
    baseUrl = provider.anthropicUrl;
  }
  const target = new URL(baseUrl);

  // ---- 构建转发请求 ----
  const forwardHeaders: Record<string, string> = { ...headers, host: target.hostname };
  forwardHeaders['x-proxy'] = 'token-local-route';

  // 始终用 provider 的 apiKey
  delete forwardHeaders['authorization'];
  if (provider.apiKey) {
    forwardHeaders['authorization'] = `Bearer ${provider.apiKey}`;
  }

  const transport = target.protocol === 'https:' ? https : http;
  const port = target.port || (target.protocol === 'https:' ? 443 : 80);
  // 拼接 URL 的 pathname 前缀（如 /anthropic）和请求 path
  const fullPath = (target.pathname !== '/' ? target.pathname : '') + path;

  return new Promise((resolve) => {
    const req = transport.request(
      { hostname: target.hostname, port, path: fullPath, method, headers: forwardHeaders, timeout: 30000 },
      (res) => {
        statusCode = res.statusCode || 0;
        const respHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (v !== undefined) respHeaders[k] = Array.isArray(v) ? v.join(', ') : v;
        }

        res.on('data', (chunk: Buffer) => {
          const s = chunk.toString('utf-8');
          if (firstByte) { ttfbMs = Date.now() - startTime; firstByte = false; }
          if (isStream && onStreamChunk) { onStreamChunk(s); streamChunks.push(s); }
          else { responseBody += s; }
        });

        res.on('end', () => {
          const totalMs = Date.now() - startTime;
          let tokens: ParsedResponse | null = null;
          if (isStream) {
            tokens = isAnthropic
              ? extractAnthropicTokensFromStream(streamChunks.join(''))
              : extractTokensFromSSEStream(streamChunks.join(''));
          } else {
            tokens = isAnthropic
              ? parseAnthropicResponse(responseBody)
              : parseNonStreamResponse(responseBody);
          }

          if (statusCode === 429) errorType = 'rate_limit';
          else if (statusCode >= 500) errorType = 'server_error';

          resolve({ statusCode, headers: respHeaders, body: responseBody, streamChunks,
            timing: { startTime, ttfbMs, totalMs }, tokens, errorType, providerName });
        });

        res.on('error', () => resolve(makeError(startTime, ttfbMs, 'network', providerName)));
      },
    );

    req.on('timeout', () => { req.destroy(); resolve(makeError(startTime, ttfbMs, 'timeout', providerName)); });
    req.on('error', () => { resolve(makeError(startTime, ttfbMs, 'network', providerName)); });

    if (body) req.write(body);
    req.end();
  });
}

function extractModel(body: string | null): string {
  if (!body) return 'unknown';
  try { return JSON.parse(body).model || 'unknown'; } catch { return 'unknown'; }
}

function isStreamBody(body: string | null): boolean {
  if (!body) return false;
  try { const j = JSON.parse(body); return j.stream === true; } catch { return false; }
}

function makeError(start: number, ttfb: number, errType: string, provider: string): ForwardResult {
  return {
    statusCode: 0, headers: {}, body: '', streamChunks: [],
    timing: { startTime: start, ttfbMs: ttfb, totalMs: Date.now() - start },
    tokens: null, errorType: errType, providerName: provider,
  };
}
