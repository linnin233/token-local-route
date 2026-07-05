/**
 * REST API 路由
 *
 * 使用 Hono 框架定义所有统计查询和管理 API 端点。
 * 所有路由在 index.ts 中注册到 /api 前缀下。
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type Database from 'better-sqlite3';
import { getConfig, saveConfig } from '../config.js';
import type { Config } from '../config.js';

// ============================================================================
// Router 创建
// ============================================================================

/**
 * 创建 API 路由处理器
 *
 * @param db  SQLite 数据库实例
 * @returns Hono 应用实例（含所有 /api/* 路由）
 */
export function createApiRouter(db: Database.Database): Hono {
  const app = new Hono();

  // ==========================================================================
  // GET /api/health — 健康检查
  // ==========================================================================
  app.get('/api/health', (c: Context) => {
    return c.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      version: '1.0.0',
      timestamp: Date.now(),
    });
  });

  // ==========================================================================
  // GET /api/stats/summary — 统计概览
  //
  // Query:  ?days=1    (默认 1，表示今天；0 表示全部时间)
  // ==========================================================================
  app.get('/api/stats/summary', (c: Context) => {
    const days = parseInt(c.req.query('days') || '1', 10);
    let timeFilter = '';
    if (days > 0) {
      const since = Date.now() - days * 86_400_000;
      timeFilter = `WHERE timestamp >= ${since}`;
    }

    // 总体统计
    const summary = db.prepare(`
      SELECT
        COUNT(*) as total_requests,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(cost_usd), 0) as total_cost_usd,
        COALESCE(AVG(latency_ms), 0) as avg_latency_ms,
        COALESCE(AVG(ttfb_ms), 0) as avg_ttfb_ms,
        COALESCE(SUM(CASE WHEN error_type IS NOT NULL OR status_code >= 400 THEN 1 ELSE 0 END), 0) as error_count
      FROM requests ${timeFilter}
    `).get() as any;

    const errorRate = summary.total_requests > 0
      ? summary.error_count / summary.total_requests
      : 0;

    // 按模型分组统计
    const models = db.prepare(`
      SELECT
        model,
        COUNT(*) as requests,
        COALESCE(SUM(total_tokens), 0) as tokens,
        COALESCE(SUM(cost_usd), 0) as cost
      FROM requests ${timeFilter}
      GROUP BY model
      ORDER BY requests DESC
    `).all();

    return c.json({
      total_requests: summary.total_requests,
      total_input_tokens: summary.total_input_tokens,
      total_output_tokens: summary.total_output_tokens,
      total_tokens: summary.total_tokens,
      total_cost_usd: Math.round(summary.total_cost_usd * 10000) / 10000, // 4 位小数
      avg_latency_ms: Math.round(summary.avg_latency_ms),
      avg_ttfb_ms: Math.round(summary.avg_ttfb_ms),
      error_count: summary.error_count,
      error_rate: Math.round(errorRate * 10000) / 100, // 百分比，2位小数
      models,
    });
  });

  // ==========================================================================
  // GET /api/stats/trend — 趋势数据
  //
  // Query:  ?granularity=hour|day&days=7
  //         默认小时粒度最近 24h，跨天时自动切换天级
  // ==========================================================================
  app.get('/api/stats/trend', (c: Context) => {
    const granularity = c.req.query('granularity') || 'hour';
    const days = parseInt(c.req.query('days') || '7', 10);

    if (granularity === 'day' || days > 1) {
      // 天级聚合
      const since = Date.now() - days * 86_400_000;
      const data = db.prepare(`
        SELECT
          date_ts as ts,
          model,
          request_count as requests,
          total_input_tokens as input_tokens,
          total_output_tokens as output_tokens,
          avg_latency_ms,
          total_cost_usd as cost_usd
        FROM daily_stats
        WHERE date_ts >= ?
        ORDER BY date_ts ASC, model ASC
      `).all(since);
      return c.json(data);
    }

    // 小时级聚合（默认）
    const since = Date.now() - days * 86_400_000;
    const data = db.prepare(`
      SELECT
        hour_ts as ts,
        model,
        request_count as requests,
        total_input_tokens as input_tokens,
        total_output_tokens as output_tokens,
        avg_latency_ms,
        total_cost_usd as cost_usd
      FROM hourly_stats
      WHERE hour_ts >= ?
      ORDER BY hour_ts ASC, model ASC
    `).all(since);
    return c.json(data);
  });

  // ==========================================================================
  // GET /api/requests — 请求日志（分页 + 过滤）
  //
  // Query:
  //   ?page=1&limit=50&model=&status=&stream=&sort=timestamp_desc&app_source=
  //   status 支持: 2xx/4xx/5xx 范围匹配，或精确数字（如 200/404/500）
  // ==========================================================================
  app.get('/api/requests', (c: Context) => {
    const page = parseInt(c.req.query('page') || '1', 10);
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200); // 最多 200
    const offset = (page - 1) * limit;
    const model = c.req.query('model') || '';
    const status = c.req.query('status') || '';
    const stream = c.req.query('stream') || '';
    const appSource = c.req.query('app_source') || '';
    const sort = c.req.query('sort') || 'timestamp_desc';

    // 排序方向
    let orderClause = 'ORDER BY timestamp DESC';
    if (sort === 'timestamp_asc') {
      orderClause = 'ORDER BY timestamp ASC';
    }

    // 构建动态 WHERE 条件
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (model) {
      conditions.push('model = ?');
      params.push(model);
    }
    if (status) {
      if (status === '2xx') {
        conditions.push('status_code >= 200 AND status_code < 300');
      } else if (status === '4xx') {
        conditions.push('status_code >= 400 AND status_code < 500');
      } else if (status === '5xx') {
        conditions.push('status_code >= 500 AND status_code < 600');
      } else {
        // 精确匹配状态码（如 200, 404, 500）
        const statusNum = parseInt(status, 10);
        if (!isNaN(statusNum)) {
          conditions.push('status_code = ?');
          params.push(statusNum);
        }
      }
    }
    if (stream !== '') {
      conditions.push('stream = ?');
      params.push(stream === '1' ? 1 : 0);
    }
    if (appSource) {
      conditions.push('app_source = ?');
      params.push(appSource);
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    // 查询数据
    const data = db.prepare(`
      SELECT * FROM requests ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // 查询总数
    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM requests ${whereClause}
    `).get(...params) as { total: number };

    return c.json({
      data,
      total: countResult?.total || 0,
      page,
      limit,
    });
  });

  // ==========================================================================
  // GET /api/speed — 测速历史
  //
  // Query:  ?limit=100
  // ==========================================================================
  app.get('/api/speed', (c: Context) => {
    const limit = Math.min(parseInt(c.req.query('limit') || '100', 10), 500);

    const data = db.prepare(`
      SELECT id, timestamp, target_url, latency_ms, ttfb_ms, success
      FROM speed_tests
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit);

    return c.json(data);
  });

  // ==========================================================================
  // GET /api/config — 查看配置
  //
  // API Key 脱敏输出，只显示最后 4 位。
  // ==========================================================================
  app.get('/api/config', (c: Context) => {
    const config = getConfig();

    // API Key 脱敏：sk-...XXXX
    const maskedKey = config.target.apiKey
      ? `sk-...${config.target.apiKey.slice(-4)}`
      : '';

    return c.json({
      proxy: { ...config.proxy },
      target: {
        ...config.target,
        apiKey: maskedKey,
      },
      speedTest: { ...config.speedTest },
    });
  });

  // ==========================================================================
  // POST /api/config — 更新配置
  //
  // Body:  partial Config JSON
  // 注意：某些配置项（如 proxy.port）需要重启服务器后生效，
  //       但文件会被立即写入。
  // ==========================================================================
  app.post('/api/config', async (c: Context) => {
    try {
      const currentConfig = getConfig();
      const body = await c.req.json() as Partial<Config>;

      // 按节深度合并，只覆盖请求中提供的字段
      const newConfig: Config = {
        proxy: {
          ...currentConfig.proxy,
          ...(body.proxy || {}),
        },
        target: {
          ...currentConfig.target,
          ...(body.target || {}),
        },
        speedTest: {
          ...currentConfig.speedTest,
          ...(body.speedTest || {}),
        },
      };

      saveConfig(newConfig);

      // 返回时脱敏
      const maskedKey = newConfig.target.apiKey
        ? `sk-...${newConfig.target.apiKey.slice(-4)}`
        : '';

      return c.json({
        success: true,
        config: {
          ...newConfig,
          target: {
            ...newConfig.target,
            apiKey: maskedKey,
          },
        },
      });
    } catch (err) {
      const message = (err as Error).message;
      return c.json({ error: `Failed to update config: ${message}` }, 400);
    }
  });

  return app;
}
