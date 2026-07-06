# Token Local Route

Local LLM API proxy for token usage statistics, provider routing, and cost tracking.

Runs on `http://127.0.0.1:12370`. All your AI tools (Claude Code, OpenCode, Cherry Studio, Cursor...) send requests to the proxy, which routes them to the configured provider (DeepSeek, OpenAI, etc.) and logs every request with token counts, latency, and cost.

## Quick Start

```bash
# 1. 安装依赖
pnpm install

# 2. 配置 API Key（或直接编辑 ~/.token-local-route/config.json）
set DEEPSEEK_API_KEY=sk-your-key-here

# 3. 启动（后端 + Dashboard）
pnpm dev
```

第一次启动会自动生成 `~/.token-local-route/config.json`。

### 安装 tlr 全局命令

```bash
# 项目目录下执行一次，之后任意目录直接 tlr 启动
npm link

# 启动代理
tlr
```

### 启动方式

| 方式 | 命令 | 说明 |
|---|---|---|
| 全栈启动 | `pnpm dev` | 后端(:12370) + Dashboard(:5173) |
| 仅后端 | `pnpm --filter @token-local-route/server dev` | 纯代理，无前端 |
| 仅 Dashboard | `pnpm --filter @token-local-route/dashboard dev` | 需要后端已运行 |

AI 工具配置：

| 字段 | 值 |
|---|---|
| API Base URL | `http://127.0.0.1:12370` |
| API Key | `~/.token-local-route/config.json` 里的 `proxyKey` |

### 测试代理是否工作

```bash
curl -s http://127.0.0.1:12370/api/health
# -> {"status":"ok"}
```

## Architecture

```
AI Tools ──Bearer proxyKey──→ Proxy (:12370) ──Bearer realKey──→ Provider API
                                    |
                              SQLite (stats)
                                    |
                           Dashboard (:5173)
```

支持两种 API 格式：

| 客户端 | 请求路径 | 代理转发 |
|---|---|---|
| OpenAI 格式 (Cherry Studio, OpenCode) | `/v1/chat/completions` | `provider.baseUrl` |
| Anthropic 格式 (Claude CLI) | `/v1/messages` | `provider.anthropicUrl` |

## Config

`~/.token-local-route/config.json`:

```json
{
  "proxyKey": "tlr-...",
  "providers": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com",
      "anthropicUrl": "https://api.deepseek.com/anthropic",
      "apiKey": "your-deepseek-key",
      "apiType": "openai"
    }
  },
  "routes": [
    { "model": "deepseek-*", "provider": "deepseek" }
  ],
  "defaultProvider": "deepseek"
}
```

- **providers** — API providers with their endpoints and keys
- **routes** — model name patterns to provider mapping (supports `*` wildcard)
- **defaultProvider** — fallback for unmatched models

Config can be managed online at `http://localhost:5173/#/config`.

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/stats/summary` | Aggregated token/cost/latency stats |
| `GET /api/stats/trend` | Hourly/daily trend data |
| `GET /api/requests` | Paginated request log with filters |
| `GET /api/config` | Current configuration |
| `POST /api/config/provider` | Add/update provider |
| `DELETE /api/config/provider/:name` | Delete provider |
| `POST /api/config/route` | Add route |
| `DELETE /api/config/route` | Delete route |
| `POST /api/config/default-provider` | Set default provider |

## Project Structure

```
token-local-route/
├── packages/
│   ├── server/      Node.js + TypeScript + Hono + SQLite
│   │   └── src/
│   │       ├── proxy/      请求转发, 路由, 格式解析
│   │       ├── stats/      统计收集, 聚合
│   │       ├── api/        REST API, WebSocket
│   │       └── db/         SQLite schema
│   └── dashboard/   Vue 3 + Vite
└── config      ~/.token-local-route/config.json
```

## Dashboard

Open `http://localhost:5173`:

- **Overview** — request counts, token usage, cost, latency
- **Request Log** — filterable, paginated request history
- **Config** — online provider/route management
