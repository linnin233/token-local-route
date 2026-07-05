/**
 * token-local-route — 配置管理
 *
 * 从 ~/.token-local-route/config.json 读取/写入配置，
 * 与环境变量 DEEPSEEK_API_KEY 合并。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ============================================================================
// 配置接口定义
// ============================================================================

export interface Config {
  proxy: {
    /** 本地代理监听端口，默认 12370 */
    port: number;
    /** 本地代理绑定地址，默认 '127.0.0.1' */
    host: string;
  };
  target: {
    /** 上游 LLM API 地址，默认 'https://api.deepseek.com' */
    baseUrl: string;
    /** API Key，优先从环境变量 DEEPSEEK_API_KEY 读取 */
    apiKey: string;
  };
  speedTest: {
    /** 测速间隔（毫秒），默认 30000 */
    intervalMs: number;
    /** 是否启用测速，默认 true */
    enabled: boolean;
  };
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: Config = {
  proxy: {
    port: 12370,
    host: '127.0.0.1',
  },
  target: {
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
  },
  speedTest: {
    intervalMs: 30_000,
    enabled: true,
  },
};

// ============================================================================
// 路径辅助
// ============================================================================

/**
 * 返回配置目录路径：~/.token-local-route
 */
export function getConfigPath(): string {
  return path.join(os.homedir(), '.token-local-route');
}

/**
 * 返回配置文件完整路径：~/.token-local-route/config.json
 */
function getConfigFilePath(): string {
  return path.join(getConfigPath(), 'config.json');
}

// ============================================================================
// 读写配置
// ============================================================================

/**
 * 读取并合并配置。
 *
 * 优先级（高 → 低）：
 * 1. 环境变量 DEEPSEEK_API_KEY
 * 2. 配置文件 ~/.token-local-route/config.json
 * 3. 内置默认值
 *
 * 如果文件不存在或 JSON 格式错误，返回全部默认值（不抛出异常）。
 */
export function getConfig(): Config {
  const config: Config = { ...DEFAULT_CONFIG };

  try {
    const filePath = getConfigFilePath();

    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<Config>;

      // 逐层合并，只覆盖存在的键
      if (parsed.proxy) {
        config.proxy = { ...config.proxy, ...parsed.proxy };
      }
      if (parsed.target) {
        config.target = { ...config.target, ...parsed.target };
      }
      if (parsed.speedTest) {
        config.speedTest = { ...config.speedTest, ...parsed.speedTest };
      }
    }
  } catch (err) {
    // 文件不存在或 JSON 解析失败：静默回退到默认值
    console.warn('[config] Failed to read config file, using defaults:', err);
  }

  // 环境变量覆盖 API Key（最高优先级）
  const envApiKey = process.env.DEEPSEEK_API_KEY;
  if (envApiKey && envApiKey.trim().length > 0) {
    config.target.apiKey = envApiKey.trim();
  }

  return config;
}

/**
 * 将配置写入 ~/.token-local-route/config.json。
 * 如果目录不存在则自动创建。
 */
export function saveConfig(config: Config): void {
  const dir = getConfigPath();

  // 确保目录存在
  fs.mkdirSync(dir, { recursive: true });

  const filePath = getConfigFilePath();
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
}
