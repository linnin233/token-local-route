/**
 * 统计收集器
 *
 * 将请求记录写入 SQLite 数据库，并提供定价查询。
 * 所有操作同步执行（better-sqlite3 是同步 API），
 * 写入错误不会抛出 — 统计不应中断代理服务。
 */

import Database from 'better-sqlite3';
import type { RequestRecord } from '../proxy/server.js';

// ============================================================================
// 预编译 SQL 语句 (在 insertRequest 首次调用时初始化)
// ============================================================================

let insertStmt: Database.Statement | null = null;

/**
 * 将请求记录插入 requests 表。
 *
 * @param db     数据库实例
 * @param record 请求记录（cost_usd 应已在外层计算好）
 */
export function insertRequest(db: Database.Database, record: RequestRecord): void {
  try {
    // 懒初始化预编译语句 — better-sqlite3 的 prepared statement 效率更高
    if (!insertStmt) {
      insertStmt = db.prepare(`
        INSERT INTO requests (
          timestamp, model, provider, stream, status_code,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
          total_tokens, latency_ms, ttfb_ms, cost_usd,
          error_type, endpoint, app_source
        ) VALUES (
          @timestamp, @model, @provider, @stream, @status_code,
          @input_tokens, @output_tokens, @cache_read_tokens, @cache_write_tokens,
          @total_tokens, @latency_ms, @ttfb_ms, @cost_usd,
          @error_type, @endpoint, @app_source
        )
      `);
    }

    insertStmt.run({
      timestamp: record.timestamp,
      model: record.model,
      provider: record.provider,
      stream: record.stream,
      status_code: record.status_code,
      input_tokens: record.input_tokens,
      output_tokens: record.output_tokens,
      cache_read_tokens: record.cache_read_tokens,
      cache_write_tokens: record.cache_write_tokens,
      total_tokens: record.total_tokens,
      latency_ms: record.latency_ms,
      ttfb_ms: record.ttfb_ms,
      cost_usd: record.cost_usd,
      error_type: record.error_type,
      endpoint: record.endpoint,
      app_source: record.app_source,
    });
  } catch (err) {
    // 统计写入失败不能中断代理 — 只打日志
    console.error('[collector] Failed to insert request record:', (err as Error).message);
  }
}

// ============================================================================
// 定价查询
// ============================================================================

let pricingStmt: Database.Statement | null = null;

/** 定价信息 */
export interface PricingInfo {
  input_price: number;
  output_price: number;
  cache_read_price: number;
  cache_write_price: number;
}

/**
 * 查询指定模型的定价（支持模糊匹配）。
 *
 * 匹配策略：
 *   1. 精确匹配 model（如 deepseek-chat）
 *   2. 前缀匹配（如 deepseek-v4-flash → 尝试 deepseek 族价格）
 *   3. 返回 null 如果完全不匹配
 *
 * @returns 定价信息，如果模型不在 pricing 表中则返回 null
 */
export function getPricing(db: Database.Database, model: string): PricingInfo | null {
  try {
    if (!pricingStmt) {
      pricingStmt = db.prepare(
        'SELECT input_price, output_price, cache_read_price, cache_write_price FROM pricing WHERE model = ?',
      );
    }

    // 1. 精确匹配
    let row = pricingStmt.get(model) as PricingInfo | undefined;
    if (row) return row;

    // 2. 模糊匹配：模型名规范化（如 deepseek-v4-flash → deepseek-chat 定价）
    //    deepseek-v* 和 deepseek-chat 类模型使用 deepseek-chat 定价
    const baseModel = normalizeModel(model);
    if (baseModel !== model) {
      row = pricingStmt.get(baseModel) as PricingInfo | undefined;
      if (row) return row;
    }

    return null;
  } catch (err) {
    console.error('[collector] Failed to query pricing:', (err as Error).message);
    return null;
  }
}

/**
 * 将模型名规范化为定价表中的基础模型名
 *   deepseek-chat (官方别名) → deepseek-v4-flash
 *   deepseek-v4-flash        → deepseek-v4-flash (精确匹配)
 *   deepseek-v4-pro          → deepseek-v4-pro   (精确匹配)
 *   deepseek-reasoner        → deepseek-reasoner
 */
function normalizeModel(model: string): string {
  if (model === 'deepseek-chat') return 'deepseek-v4-flash';
  return model;
}
