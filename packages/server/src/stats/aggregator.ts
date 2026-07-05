/**
 * 统计聚合器
 *
 * 定时将 requests 表中的原始数据聚合到 hourly_stats 和 daily_stats 表中。
 * 运行频率：每 60 秒执行一次（可调整）。
 */

import Database from 'better-sqlite3';

// ============================================================================
// 时间工具
// ============================================================================

/** 将时间戳截断到整小时起点 */
function hourFloor(ts: number): number {
  return Math.floor(ts / 3_600_000) * 3_600_000;
}

/** 将时间戳截断到整天起点（UTC+8 本地时间） */
function dayFloor(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ============================================================================
// 聚合 SQL
// ============================================================================

/**
 * 聚合指定时间范围内的请求到 hourly_stats 表
 */
function aggregateHourly(db: Database.Database, hourStart: number, hourEnd: number): void {
  db.exec(`
    INSERT INTO hourly_stats (
      hour_ts, model, request_count, error_count,
      total_input_tokens, total_output_tokens,
      total_cache_read_tokens, total_cache_write_tokens,
      avg_latency_ms, avg_ttfb_ms, total_cost_usd
    )
    SELECT
      ${hourStart} as hour_ts,
      model,
      COUNT(*) as request_count,
      SUM(CASE WHEN error_type IS NOT NULL OR status_code >= 400 THEN 1 ELSE 0 END) as error_count,
      SUM(input_tokens) as total_input_tokens,
      SUM(output_tokens) as total_output_tokens,
      SUM(cache_read_tokens) as total_cache_read_tokens,
      SUM(cache_write_tokens) as total_cache_write_tokens,
      AVG(latency_ms) as avg_latency_ms,
      AVG(ttfb_ms) as avg_ttfb_ms,
      SUM(cost_usd) as total_cost_usd
    FROM requests
    WHERE timestamp >= ${hourStart} AND timestamp < ${hourEnd}
    GROUP BY model
    ON CONFLICT(hour_ts, model) DO UPDATE SET
      request_count = excluded.request_count,
      error_count = excluded.error_count,
      total_input_tokens = excluded.total_input_tokens,
      total_output_tokens = excluded.total_output_tokens,
      total_cache_read_tokens = excluded.total_cache_read_tokens,
      total_cache_write_tokens = excluded.total_cache_write_tokens,
      avg_latency_ms = excluded.avg_latency_ms,
      avg_ttfb_ms = excluded.avg_ttfb_ms,
      total_cost_usd = excluded.total_cost_usd;
  `);
}

/**
 * 聚合指定时间范围内的请求到 daily_stats 表
 */
function aggregateDaily(db: Database.Database, dayStart: number, dayEnd: number): void {
  db.exec(`
    INSERT INTO daily_stats (
      date_ts, model, request_count, error_count,
      total_input_tokens, total_output_tokens,
      total_cache_read_tokens, total_cache_write_tokens,
      avg_latency_ms, avg_ttfb_ms, total_cost_usd
    )
    SELECT
      ${dayStart} as date_ts,
      model,
      COUNT(*) as request_count,
      SUM(CASE WHEN error_type IS NOT NULL OR status_code >= 400 THEN 1 ELSE 0 END) as error_count,
      SUM(input_tokens) as total_input_tokens,
      SUM(output_tokens) as total_output_tokens,
      SUM(cache_read_tokens) as total_cache_read_tokens,
      SUM(cache_write_tokens) as total_cache_write_tokens,
      AVG(latency_ms) as avg_latency_ms,
      AVG(ttfb_ms) as avg_ttfb_ms,
      SUM(cost_usd) as total_cost_usd
    FROM requests
    WHERE timestamp >= ${dayStart} AND timestamp < ${dayEnd}
    GROUP BY model
    ON CONFLICT(date_ts, model) DO UPDATE SET
      request_count = excluded.request_count,
      error_count = excluded.error_count,
      total_input_tokens = excluded.total_input_tokens,
      total_output_tokens = excluded.total_output_tokens,
      total_cache_read_tokens = excluded.total_cache_read_tokens,
      total_cache_write_tokens = excluded.total_cache_write_tokens,
      avg_latency_ms = excluded.avg_latency_ms,
      avg_ttfb_ms = excluded.avg_ttfb_ms,
      total_cost_usd = excluded.total_cost_usd;
  `);
}

// ============================================================================
// 聚合器生命周期
// ============================================================================

/**
 * 启动聚合器 — 每 60 秒运行一次。
 *
 * 每次运行聚合：
 *  - 上一个完整小时的数据 → hourly_stats
 *  - 上一个完整天的数据 → daily_stats
 *
 * @returns Node.js 定时器句柄，用于 stopAggregator
 */
export function startAggregator(db: Database.Database): NodeJS.Timeout {
  return setInterval(() => {
    try {
      const now = Date.now();

      // 聚合上一个完整小时
      const lastHour = hourFloor(now) - 3_600_000;
      aggregateHourly(db, lastHour, lastHour + 3_600_000);

      // 聚合上一个完整天（昨天）
      const today = dayFloor(now);
      const yesterday = today - 86_400_000;
      aggregateDaily(db, yesterday, today);
    } catch (err) {
      // 聚合失败不崩溃 — 下次重试
      console.error('[aggregator] Aggregation failed:', (err as Error).message);
    }
  }, 60_000);
}

/**
 * 停止聚合器
 */
export function stopAggregator(timer: NodeJS.Timeout): void {
  clearInterval(timer);
  console.log('[aggregator] Stopped');
}
