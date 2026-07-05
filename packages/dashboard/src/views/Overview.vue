<template>
  <div class="overview">
    <h2 class="page-title">Dashboard Overview</h2>

    <!-- Hero Cards -->
    <div class="hero-grid">
      <HeroCard title="Total Requests" :value="summary?.total_requests ?? '--'" icon="📊" color="blue" />
      <HeroCard title="Total Tokens" :value="fmtNum(summary?.total_tokens ?? 0)" icon="🎯" color="green" />
      <HeroCard title="Total Cost" :value="'$' + (summary?.total_cost_usd?.toFixed(4) ?? '--')" icon="💰" color="yellow" />
      <HeroCard title="Avg Latency" :value="summary?.avg_latency_ms ? summary.avg_latency_ms + 'ms' : '--'" icon="⚡" color="purple" />
    </div>

    <!-- Secondary stats -->
    <div class="hero-grid hero-grid--small" v-if="summary">
      <HeroCard title="Input Tokens" :value="fmtNum(summary.total_input_tokens)" icon="📥" color="blue" />
      <HeroCard title="Output Tokens" :value="fmtNum(summary.total_output_tokens)" icon="📤" color="green" />
      <HeroCard title="Error Rate" :value="summary.error_rate?.toFixed(1) + '%'" icon="❌" color="red" />
      <HeroCard title="Avg TTFB" :value="summary.avg_ttfb_ms ? summary.avg_ttfb_ms + 'ms' : '--'" icon="⏱️" color="purple" />
    </div>

    <!-- Charts -->
    <div class="charts-grid">
      <div class="chart-card">
        <h3>Token Trends</h3>
        <TokenChart :data="trendData" :loading="loading" />
      </div>
      <div class="chart-card">
        <h3>Latency Trends</h3>
        <LatencyChart :data="trendData" :loading="loading" />
      </div>
    </div>

    <!-- Per-model breakdown -->
    <div v-if="summary?.models?.length" class="section">
      <h3>Per-Model Breakdown</h3>
      <table class="model-table">
        <thead>
          <tr><th>Model</th><th class="num">Requests</th><th class="num">Tokens</th><th class="num">Cost</th></tr>
        </thead>
        <tbody>
          <tr v-for="m in summary.models" :key="m.model">
            <td>{{ m.model }}</td>
            <td class="num">{{ fmtNum(m.requests) }}</td>
            <td class="num">{{ fmtNum(m.tokens) }}</td>
            <td class="num">${{ m.cost.toFixed(4) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import HeroCard from '../components/HeroCard.vue';
import TokenChart from '../components/TokenChart.vue';
import LatencyChart from '../components/LatencyChart.vue';
import { useApi } from '../composables/useApi';
import { useWebSocket } from '../composables/useWebSocket';
import type { StatsSummary, TrendPoint } from '../types';

const { loading, fetchStatsSummary, fetchTrend } = useApi();
const { lastRequest } = useWebSocket();

const summary = ref<StatsSummary | null>(null);
const trendData = ref<TrendPoint[]>([]);
let refreshTimer: ReturnType<typeof setInterval> | null = null;

async function refresh() {
  try {
    const [s, t] = await Promise.all([
      fetchStatsSummary(0),
      fetchTrend('hour', 1),
    ]);
    summary.value = s;
    trendData.value = t;
  } catch { /* silent */ }
}

// When WS pushes a new request, refresh stats
watch(lastRequest, () => { refresh(); });

onMounted(() => {
  refresh();
  refreshTimer = setInterval(refresh, 10_000);
});
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
</script>

<style scoped>
.overview { max-width: 1200px; }
.page-title { font-size: 22px; font-weight: 600; margin-bottom: 24px; }
.hero-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px; }
.hero-grid--small { grid-template-columns: repeat(4, 1fr); }
.charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
.chart-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px;
}
.chart-card h3 { font-size: 15px; color: var(--text-secondary); margin: 0 0 16px 0; }
.section { margin-top: 24px; }
.section h3 { font-size: 15px; color: var(--text-secondary); margin-bottom: 12px; }
.model-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.model-table th { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); color: var(--text-secondary); font-weight: 600; }
.model-table td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
@media (max-width: 900px) {
  .hero-grid, .hero-grid--small { grid-template-columns: repeat(2, 1fr); }
  .charts-grid { grid-template-columns: 1fr; }
}
</style>
