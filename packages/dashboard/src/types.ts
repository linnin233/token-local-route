/** Types shared across the dashboard */

export interface RequestRecord {
  id: number;
  timestamp: number;
  model: string;
  provider: string;
  stream: number;
  status_code: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_tokens: number;
  latency_ms: number;
  ttfb_ms: number;
  cost_usd: number;
  error_type: string | null;
  endpoint: string;
  app_source: string;
}

export interface StatsSummary {
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  avg_ttfb_ms: number;
  error_count: number;
  error_rate: number;
  models: ModelStat[];
}

export interface ModelStat {
  model: string;
  requests: number;
  tokens: number;
  cost: number;
}

export interface TrendPoint {
  ts: number;
  model: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  avg_latency_ms: number;
  avg_ttfb_ms: number;
  cost_usd: number;
}

export interface SpeedRecord {
  id: number;
  timestamp: number;
  target_url: string;
  latency_ms: number;
  ttfb_ms: number;
  success: number;
}

export interface WSMessage {
  type: 'connected' | 'new_request' | 'speed_test';
  data?: any;
  timestamp?: number;
}
