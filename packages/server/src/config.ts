/**
 * 配置管理 — ~/.token-local-route/config.json
 *
 * proxyKey: AI 工具连接代理时使用的本地密钥（自动生成）
 * providers: 上游 API 提供商配置（apiKey 填真实的 DeepSeek/OpenAI 密钥）
 * routes: 模型名 → provider 映射
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// ============================================================================
// 类型
// ============================================================================

export interface Provider {
  baseUrl: string;
  /** Anthropic 格式端点 URL（可选，不填则用 baseUrl） */
  anthropicUrl?: string;
  apiKey: string;
  apiType: 'openai' | 'anthropic';
}

export interface Route {
  model: string;
  provider: string;
}

export interface Config {
  proxy: { port: number; host: string };
  /** AI 工具连代理时用的本地密钥 */
  proxyKey: string;
  providers: Record<string, Provider>;
  routes: Route[];
  defaultProvider: string;
}

// ============================================================================
// 默认配置
// ============================================================================

function genKey(): string {
  return 'tlr-' + crypto.randomBytes(24).toString('hex');
}

const DEFAULT_CONFIG: Config = {
  proxy: { port: 12370, host: '127.0.0.1' },
  proxyKey: genKey(),
  providers: {
    deepseek: {
      baseUrl: 'https://api.deepseek.com',
      anthropicUrl: 'https://api.deepseek.com/anthropic',
      apiKey: '',
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

export function getConfig(): Config {
  if (cached) return cached;

  const filePath = getConfigFile();
  let loaded: Partial<Config> = {};

  try {
    if (fs.existsSync(filePath)) {
      loaded = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.warn('[config] Failed to read config:', (err as Error).message);
  }

  // 深度合并：已保存的配置优先，缺失的用默认值（包括新生成的 proxyKey）
  const merged: Config = {
    proxy: { ...DEFAULT_CONFIG.proxy, ...(loaded.proxy || {}) },
    proxyKey: loaded.proxyKey || DEFAULT_CONFIG.proxyKey,
    providers: loaded.providers || DEFAULT_CONFIG.providers,
    routes: loaded.routes || DEFAULT_CONFIG.routes,
    defaultProvider: loaded.defaultProvider || DEFAULT_CONFIG.defaultProvider,
  };

  // 首次运行自动保存
  if (!fs.existsSync(filePath)) {
    saveConfig(merged);
  }

  cached = merged;
  return cached;
}

export function saveConfig(config: Config): void {
  const dir = path.dirname(getConfigFile());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getConfigFile(), JSON.stringify(config, null, 2), 'utf-8');
  cached = config;
}

// ============================================================================
// 路由匹配
// ============================================================================

export function resolveProvider(config: Config, model: string): Provider {
  for (const route of config.routes) {
    if (!route.model.includes('*') && route.model === model) {
      const p = config.providers[route.provider];
      if (p) return p;
    }
  }
  for (const route of config.routes) {
    if (route.model.includes('*')) {
      const regex = new RegExp('^' + route.model.replace(/\*/g, '.*') + '$');
      if (regex.test(model)) {
        const p = config.providers[route.provider];
        if (p) return p;
      }
    }
  }
  const fallback = config.providers[config.defaultProvider];
  if (fallback) return fallback;
  const first = Object.values(config.providers)[0];
  if (first) return first;
  throw new Error('No provider configured');
}

export function resolveProviderName(config: Config, model: string): string {
  for (const route of config.routes) {
    if (!route.model.includes('*') && route.model === model) return route.provider;
  }
  for (const route of config.routes) {
    if (route.model.includes('*')) {
      if (new RegExp('^' + route.model.replace(/\*/g, '.*') + '$').test(model)) return route.provider;
    }
  }
  return config.defaultProvider;
}
