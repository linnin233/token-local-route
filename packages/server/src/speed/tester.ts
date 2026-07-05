/**
 * 实时测速器
 *
 * 定时向 DeepSeek API 发送轻量级请求（max_tokens=1），
 * 测量网络延迟并记录到 speed_tests 表。
 */

import https from 'node:https';
import Database from 'better-sqlite3';
import type { Config } from '../config.js';

// ============================================================================
// 预编译 SQL 语句
// ============================================================================

let insertSpeedStmt: Database.Statement | null = null;

/**
 * 写入一条测速记录
 */
function recordSpeedTest(db: Database.Database, target: string, latency: number, ttfb: number, success: boolean): void {
  try {
    if (!insertSpeedStmt) {
      insertSpeedStmt = db.prepare(`
        INSERT INTO speed_tests (timestamp, target_url, latency_ms, ttfb_ms, success)
        VALUES (@timestamp, @target_url, @latency_ms, @ttfb_ms, @success)
      `);
    }

    insertSpeedStmt.run({
      timestamp: Date.now(),
      target_url: target,
      latency_ms: latency,
      ttfb_ms: ttfb,
      success: success ? 1 : 0,
    });
  } catch (err) {
    console.error('[speed] Failed to record speed test:', (err as Error).message);
  }
}

// ============================================================================
// 测速请求
// ============================================================================

/**
 * 向 DeepSeek API 发送一次轻量请求并测量延迟。
 *
 * 请求体：{ model: "deepseek-chat", messages: [{role:"user",content:"hi"}], max_tokens: 1, stream: false }
 */
async function pingDeepSeek(config: Config): Promise<{
  latencyMs: number;
  ttfbMs: number;
  success: boolean;
}> {
  const startTime = Date.now();
  let ttfbMs = 0;
  let firstByte = true;

  const body = JSON.stringify({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 1,
    stream: false,
  });

  const target = new URL(config.target.baseUrl);

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: target.hostname,
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.target.apiKey}`,
          'Content-Length': Buffer.byteLength(body).toString(),
        },
        timeout: 10_000, // 10 秒超时
      },
      (res) => {
        // 第一个 data 事件记录 TTFB
        res.on('data', () => {
          if (firstByte) {
            ttfbMs = Date.now() - startTime;
            firstByte = false;
          }
        });

        // 响应结束 — 计算总延迟
        res.on('end', () => {
          const latencyMs = Date.now() - startTime;
          resolve({
            latencyMs,
            ttfbMs: ttfbMs || latencyMs,
            success: res.statusCode === 200,
          });
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ latencyMs: 10_000, ttfbMs: 10_000, success: false });
    });

    req.on('error', (err) => {
      console.error('[speed] Ping failed:', err.message);
      resolve({ latencyMs: Date.now() - startTime, ttfbMs: 0, success: false });
    });

    req.write(body);
    req.end();
  });
}

// ============================================================================
// 测速器生命周期
// ============================================================================

/**
 * 启动定时测速器
 *
 * @returns Node.js 定时器句柄
 */
export function startSpeedTester(db: Database.Database, config: Config): NodeJS.Timeout {
  if (!config.target.apiKey) {
    console.warn('[speed] No API key configured — speed tester disabled');
    return setInterval(() => {}, 999_999_999); // 返回一个无害的 dummy timer
  }

  const target = `${config.target.baseUrl}/v1/chat/completions`;

  // 启动后立即执行一次
  (async () => {
    const result = await pingDeepSeek(config);
    recordSpeedTest(db, target, result.latencyMs, result.ttfbMs, result.success);
    console.log(`[speed] Initial ping: ${result.latencyMs}ms (success: ${result.success})`);
  })();

  // 定时执行
  const timer = setInterval(async () => {
    try {
      const result = await pingDeepSeek(config);
      recordSpeedTest(db, target, result.latencyMs, result.ttfbMs, result.success);
    } catch (err) {
      console.error('[speed] Speed test cycle failed:', (err as Error).message);
    }
  }, config.speedTest.intervalMs);

  console.log(`[speed] Speed tester started (interval: ${config.speedTest.intervalMs}ms)`);
  return timer;
}

/**
 * 停止测速器
 */
export function stopSpeedTester(timer: NodeJS.Timeout): void {
  clearInterval(timer);
  console.log('[speed] Speed tester stopped');
}
