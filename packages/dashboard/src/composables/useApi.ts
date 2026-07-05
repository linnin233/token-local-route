import { ref } from 'vue';
import type { StatsSummary, RequestRecord, TrendPoint, SpeedRecord } from '../types';

const BASE = '/api';

export function useApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  /** Internal generic fetch helper — sets loading/error state, throws on HTTP error. */
  async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return (await res.json()) as T;
    } catch (e: any) {
      error.value = e.message || 'Request failed';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /** Fetch aggregated statistics for the last N days. */
  async function fetchStatsSummary(days = 1): Promise<StatsSummary> {
    return apiFetch<StatsSummary>(`${BASE}/stats/summary?days=${days}`);
  }

  /** Fetch trend data (hourly or daily) for the last N days. */
  async function fetchTrend(
    granularity: 'hour' | 'day' = 'hour',
    days = 1,
  ): Promise<TrendPoint[]> {
    return apiFetch<TrendPoint[]>(
      `${BASE}/stats/trend?granularity=${granularity}&days=${days}`,
    );
  }

  /** Fetch paginated request records with optional filters. */
  async function fetchRequests(
    params: {
      page?: number;
      limit?: number;
      model?: string;
      status?: string;
      stream?: string;
      app_source?: string;
    } = {},
  ): Promise<{
    data: RequestRecord[];
    total: number;
    page: number;
    limit: number;
  }> {
    const q = new URLSearchParams();
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));
    if (params.model) q.set('model', params.model);
    if (params.status) q.set('status', params.status);
    if (params.stream) q.set('stream', params.stream);
    if (params.app_source) q.set('app_source', params.app_source);
    return apiFetch(`${BASE}/requests?${q.toString()}`);
  }

  /** Fetch the latest speed-test records. */
  async function fetchSpeed(limit = 100): Promise<SpeedRecord[]> {
    return apiFetch<SpeedRecord[]>(`${BASE}/speed?limit=${limit}`);
  }

  /** Fetch dashboard server configuration (models, intervals, etc.). */
  async function fetchConfig(): Promise<any> {
    return apiFetch<any>(`${BASE}/config`);
  }

  return {
    loading,
    error,
    fetchStatsSummary,
    fetchTrend,
    fetchRequests,
    fetchSpeed,
    fetchConfig,
  };
}
