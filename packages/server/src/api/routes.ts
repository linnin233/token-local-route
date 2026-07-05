/**
 * REST API — 统计查询 + 配置管理
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type Database from 'better-sqlite3';
import { getConfig, saveConfig } from '../config.js';
import type { Provider, Route } from '../config.js';

export function createApiRouter(db: Database.Database): Hono {
  const app = new Hono();

  // === 统计 ===

  app.get('/api/stats/summary', (c: Context) => {
    const days = parseInt(c.req.query('days') || '0');
    let filter = '';
    if (days > 0) filter = `WHERE timestamp >= ${Date.now() - days * 86_400_000}`;
    const s = db.prepare(`SELECT COUNT(*) as total_requests, COALESCE(SUM(input_tokens),0) as total_input_tokens, COALESCE(SUM(output_tokens),0) as total_output_tokens, COALESCE(SUM(total_tokens),0) as total_tokens, COALESCE(SUM(cost_usd),0) as total_cost_usd, COALESCE(AVG(latency_ms),0) as avg_latency_ms, COALESCE(AVG(ttfb_ms),0) as avg_ttfb_ms, COALESCE(SUM(CASE WHEN error_type IS NOT NULL OR status_code>=400 THEN 1 ELSE 0 END),0) as error_count FROM requests ${filter}`).get() as any;
    const models = db.prepare(`SELECT model, COUNT(*) as requests, COALESCE(SUM(total_tokens),0) as tokens, COALESCE(SUM(cost_usd),0) as cost FROM requests ${filter} GROUP BY model ORDER BY requests DESC`).all();
    const rate = s.total_requests > 0 ? s.error_count / s.total_requests : 0;
    return c.json({ total_requests:s.total_requests, total_input_tokens:s.total_input_tokens, total_output_tokens:s.total_output_tokens, total_tokens:s.total_tokens, total_cost_usd:Math.round(s.total_cost_usd*10000)/10000, avg_latency_ms:Math.round(s.avg_latency_ms), avg_ttfb_ms:Math.round(s.avg_ttfb_ms), error_count:s.error_count, error_rate:Math.round(rate*10000)/100, models });
  });

  app.get('/api/stats/trend', (c: Context) => {
    const g = c.req.query('granularity')||'hour';
    const days = parseInt(c.req.query('days')||'1');
    const since = Date.now()-days*86_400_000;
    if (g==='day'||days>1) return c.json(db.prepare(`SELECT date_ts as ts,model,request_count as requests,total_input_tokens as input_tokens,total_output_tokens as output_tokens,avg_latency_ms,total_cost_usd as cost_usd FROM daily_stats WHERE date_ts>=? ORDER BY date_ts,model`).all(since));
    return c.json(db.prepare(`SELECT hour_ts as ts,model,request_count as requests,total_input_tokens as input_tokens,total_output_tokens as output_tokens,avg_latency_ms,total_cost_usd as cost_usd FROM hourly_stats WHERE hour_ts>=? ORDER BY hour_ts,model`).all(since));
  });

  app.get('/api/requests', (c: Context) => {
    const page=parseInt(c.req.query('page')||'1'), limit=Math.min(parseInt(c.req.query('limit')||'50'),200), offset=(page-1)*limit;
    const conds:string[]=[], params:unknown[]=[];
    const m=c.req.query('model'); if(m){conds.push('model=?');params.push(m);}
    const st=c.req.query('status'); if(st==='2xx')conds.push('status_code>=200 AND status_code<300'); else if(st==='4xx')conds.push('status_code>=400 AND status_code<500'); else if(st==='5xx')conds.push('status_code>=500 AND status_code<600');
    const str=c.req.query('stream'); if(str){conds.push('stream=?');params.push(str==='1'?1:0);}
    const ap=c.req.query('app_source'); if(ap){conds.push('app_source=?');params.push(ap);}
    const where=conds.length?'WHERE '+conds.join(' AND '):'';
    const data=db.prepare(`SELECT * FROM requests ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(...params,limit,offset);
    const count=db.prepare(`SELECT COUNT(*) as total FROM requests ${where}`).get(...params) as any;
    return c.json({data,total:count?.total||0,page,limit});
  });

  // === 配置管理 ===

  app.get('/api/config', (c: Context) => {
    const cfg = getConfig();
    const providers: Record<string,any> = {};
    for (const [name,p] of Object.entries(cfg.providers)) {
      providers[name] = { baseUrl:p.baseUrl, anthropicUrl:p.anthropicUrl||'', apiType:p.apiType, apiKey:p.apiKey?'***'+p.apiKey.slice(-4):'' };
    }
    return c.json({ proxy:cfg.proxy, proxyKey:cfg.proxyKey, providers, routes:cfg.routes, defaultProvider:cfg.defaultProvider });
  });

  // 添加/更新 provider
  app.post('/api/config/provider', async (c: Context) => {
    const body = await c.req.json();
    const { name, baseUrl, apiKey, apiType, anthropicUrl } = body;
    if (!name || !baseUrl) return c.json({error:'name and baseUrl required'},400);
    const cfg = getConfig();
    cfg.providers[name] = { baseUrl, apiKey:apiKey||'', apiType:apiType||'openai', anthropicUrl:anthropicUrl||undefined } as Provider;
    saveConfig(cfg);
    return c.json({ok:true});
  });

  // 删除 provider
  app.delete('/api/config/provider/:name', (c: Context) => {
    const name = c.req.param('name')!;
    const cfg = getConfig();
    if (!cfg.providers[name]) return c.json({error:'not found'},404);
    delete cfg.providers[name];
    cfg.routes = cfg.routes.filter(r => r.provider !== name);
    if (cfg.defaultProvider === name) cfg.defaultProvider = Object.keys(cfg.providers)[0]||'';
    saveConfig(cfg);
    return c.json({ok:true});
  });

  // 添加路由
  app.post('/api/config/route', async (c: Context) => {
    const { model, provider } = await c.req.json();
    if (!model || !provider) return c.json({error:'model and provider required'},400);
    if (!getConfig().providers[provider]) return c.json({error:'provider not found'},400);
    const cfg = getConfig();
    cfg.routes = cfg.routes.filter(r => r.model !== model);
    cfg.routes.push({model, provider});
    saveConfig(cfg);
    return c.json({ok:true});
  });

  // 删除路由
  app.delete('/api/config/route', async (c: Context) => {
    const { model, provider } = await c.req.json();
    const cfg = getConfig();
    cfg.routes = cfg.routes.filter(r => !(r.model===model && r.provider===provider));
    saveConfig(cfg);
    return c.json({ok:true});
  });

  // 设置默认 provider
  app.post('/api/config/default-provider', async (c: Context) => {
    const { provider } = await c.req.json();
    if (!getConfig().providers[provider]) return c.json({error:'provider not found'},400);
    const cfg = getConfig();
    cfg.defaultProvider = provider;
    saveConfig(cfg);
    return c.json({ok:true});
  });

  return app;
}
