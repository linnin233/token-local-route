# Token Local Route

Local LLM API proxy for token usage statistics, provider routing, and cost tracking.

Runs on `http://127.0.0.1:12370`. All your AI tools (Claude Code, OpenCode, Cherry Studio, Cursor...) send requests to the proxy, which routes them to the configured provider (DeepSeek, OpenAI, etc.) and logs every request with token counts, latency, and cost.

## Quick Start

```bash
pnpm install
pnpm dev
```

First run auto-generates `~/.token-local-route/config.json`. Edit it to add your provider API keys.

Then configure your AI tool:

| Field | Value |
|---|---|
| API Base URL | `http://127.0.0.1:12370` |
| API Key | The `proxyKey` from `~/.token-local-route/config.json` |

Dashboard at `http://localhost:5173`.

## Architecture

```
AI Tools ──Bearer proxyKey──→ Proxy (:12370) ──Bearer realKey──→ Provider API
                                    │
                              SQLite (stats)
                                    │
                           Dashboard (:5173)
```

## Config

`~/.token-local-route/config.json`:

```json
{
  "proxyKey": "tlr-...",
  "providers": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com",
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
packages/
  server/      Node.js + TypeScript + Hono + SQLite
  dashboard/   Vue 3 + Vite
```
