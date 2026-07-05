/**
 * 配置管理 — ~/.token-local-route/config.json
 *
 * 三层结构：
 *   providers  — 定义每个 API 提供商 (baseUrl, apiKey, apiType)
 *   routes     — 模型名 → provider 的映射规则 (支持通配符)
 *   defaultProvider — 未匹配模型使用的默认 provider
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ============================================================================
// 类型定义
// ============================================================================

/** 一个 API 提供商 */
export interface Provider {
  /** API base URL，如 https://api.deepseek.com */
  baseUrl: string;
  /** API Key */
  apiKey: string;
  /** API 格式: openai | anthropic */
  apiType: 'openai' | 'anthropic';
}

/** 一条路由规则：匹配的模型 → 使用的 provider */
export interface Route {
  /** 模型名，支持 * 通配符。如 "deepseek-*" 匹配所有 deepseek 模型 */
  model: string;
  /** 目标 provider 名称 */
  provider: string;
}

/** 完整配置 */
export interface Config {
  proxy: {
    port: number;
    host: string;
  };
  /** provider 名 → provider 配置 */
  providers: Record<string, Provider>;
  /** 路由规则列表，从上到下匹配，命中第一条生效 */
  routes: Route[];
  /** 没有匹配路由时的默认 provider 名 */
  defaultProvider: string;
}

// ============================================================================
// 默认配置 — 首次运行自动生成
// ============================================================================

const DEFAULT_CONFIG: Config = {
  proxy: { port: 12370, host: '127.0.0.1' },
  providers: {
    deepseek: {
      baseUrl: 'https://api.deepseek.com',
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      apiType: 'openai',
    },
  },
  routes: [
    { model: 'deepseek-*', provider: 'deepseek' },
  ],
  defaultProvider: 'deepseek',
};

// ============================================================================
// 路径
// ============================================================================

function getConfigFile(): string {
  return path.join(os.homedir(), '.token-local-route', 'config.json');
}

// ============================================================================
// 读写
// ============================================================================

let cached: Config | null = null;

/** 读取配置（带缓存） */
export function getConfig(): Config {
  if (cached) return cached;

  const defaults = { ...DEFAULT_CONFIG };
  const filePath = getConfigFile();

  try {
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      // 深度合并
      if (raw.proxy) defaults.proxy = { ...defaults.proxy, ...raw.proxy };
      if (raw.providers) defaults.providers = { ...raw.providers };
      if (raw.routes) defaults.routes = raw.routes;
      if (raw.defaultProvider) defaults.defaultProvider = raw.defaultProvider;
    } else {
      // 首次运行 — 写入默认配置
      saveConfig(defaults);
    }
  } catch (err) {
    console.warn('[config] Failed to read config, using defaults:', (err as Error).message);
  }

  // 环境变量覆盖 DeepSeek 的 apiKey（如果配了的话）
  const envKey = process.env.DEEPSEEK_API_KEY;
  if (envKey && defaults.providers.deepseek) {
    defaults.providers.deepseek.apiKey = envKey;
  }

  cached = defaults;
  return cached;
}

/** 写入配置并刷新缓存 */
export function saveConfig(config: Config): void {
  const dir = path.dirname(getConfigFile());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getConfigFile(), JSON.stringify(config, null, 2), 'utf-8');
  cached = config;
}

// ============================================================================
// 路由匹配
// ============================================================================

/**
 * 根据模型名找到对应的 Provider。
 *
 * 匹配规则：
 *   1. 遍历 routes 列表，从上到下匹配
 *   2. 支持 * 通配符 (如 "deepseek-*")
 *   3. 精确匹配优先于通配符匹配
 *   4. 都没匹配到则返回 defaultProvider
 */
export function resolveProvider(config: Config, model: string): Provider {
  // 1. 精确匹配
  for (const route of config.routes) {
    if (!route.model.includes('*') && route.model === model) {
      const p = config.providers[route.provider];
      if (p) return p;
    }
  }

  // 2. 通配符匹配
  for (const route of config.routes) {
    if (route.model.includes('*')) {
      const regex = new RegExp('^' + route.model.replace(/\*/g, '.*') + '$');
      if (regex.test(model)) {
        const p = config.providers[route.provider];
        if (p) return p;
      }
    }
  }

  // 3. 默认 fallback
  const fallback = config.providers[config.defaultProvider];
  if (fallback) return fallback;

  // 4. 最后的兜底 — 返回第一个 provider
  const first = Object.values(config.providers)[0];
  if (first) return first;

  throw new Error('No provider configured');
}

/**
 * 根据模型名找到对应的 provider 名称
 */
export function resolveProviderName(config: Config, model: string): string {
  for (const route of config.routes) {
    if (!route.model.includes('*') && route.model === model) return route.provider;
  }
  for (const route of config.routes) {
    if (route.model.includes('*')) {
      const regex = new RegExp('^' + route.model.replace(/\*/g, '.*') + '$');
      if (regex.test(model)) return route.provider;
    }
  }
  return config.defaultProvider;
}
