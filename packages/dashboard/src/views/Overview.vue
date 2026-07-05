<template>
  <div>
    <h1>Dashboard Overview</h1>

    <div v-if="loading && !summary">Loading...</div>
    <div v-else-if="error">{{ error }}</div>
    <div v-else>
      <h2>Summary</h2>
      <table border="1" cellpadding="6" cellspacing="0">
        <tr><td><b>Total Requests</b></td><td>{{ summary?.total_requests ?? 0 }}</td></tr>
        <tr><td><b>Total Input Tokens</b></td><td>{{ fmtNum(summary?.total_input_tokens ?? 0) }}</td></tr>
        <tr><td><b>Total Output Tokens</b></td><td>{{ fmtNum(summary?.total_output_tokens ?? 0) }}</td></tr>
        <tr><td><b>Total Tokens</b></td><td>{{ fmtNum(summary?.total_tokens ?? 0) }}</td></tr>
        <tr><td><b>Total Cost</b></td><td>${{ (summary?.total_cost_usd ?? 0).toFixed(6) }}</td></tr>
        <tr><td><b>Avg Latency</b></td><td>{{ summary?.avg_latency_ms ?? 0 }}ms</td></tr>
        <tr><td><b>Avg TTFB</b></td><td>{{ summary?.avg_ttfb_ms ?? 0 }}ms</td></tr>
        <tr><td><b>Errors</b></td><td>{{ summary?.error_count ?? 0 }} ({{ (summary?.error_rate ?? 0).toFixed(1) }}%)</td></tr>
      </table>

      <h2>Per Model</h2>
      <table v-if="summary?.models?.length" border="1" cellpadding="6" cellspacing="0">
        <tr><th>Model</th><th>Requests</th><th>Tokens</th><th>Cost</th></tr>
        <tr v-for="m in summary.models" :key="m.model">
          <td>{{ m.model }}</td>
          <td>{{ fmtNum(m.requests) }}</td>
          <td>{{ fmtNum(m.tokens) }}</td>
          <td>${{ m.cost.toFixed(6) }}</td>
        </tr>
      </table>
      <p v-else>No data yet.</p>

      <h2>Trend Data</h2>
      <table v-if="trend.length" border="1" cellpadding="6" cellspacing="0">
        <tr><th>Time</th><th>Model</th><th>Requests</th><th>Input Tokens</th><th>Output Tokens</th><th>Avg Latency</th><th>Cost</th></tr>
        <tr v-for="t in trend" :key="t.ts + t.model">
          <td>{{ fmtTs(t.ts) }}</td>
          <td>{{ t.model }}</td>
          <td>{{ t.requests }}</td>
          <td>{{ fmtNum(t.input_tokens) }}</td>
          <td>{{ fmtNum(t.output_tokens) }}</td>
          <td>{{ t.avg_latency_ms }}ms</td>
          <td>${{ (t.cost_usd ?? 0).toFixed(6) }}</td>
        </tr>
      </table>
      <p v-else>No trend data yet.</p>
    </div>

    <p>
      <button @click="refresh">Refresh</button>
      <button @click="toggleAuto">{{ autoRefresh ? 'Stop Auto' : 'Auto Refresh' }}</button>
      <span v-if="wsConnected">🔗 Live</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useApi } from '../composables/useApi';
import { useWebSocket } from '../composables/useWebSocket';
import type { StatsSummary, TrendPoint } from '../types';

const { loading, error, fetchStatsSummary, fetchTrend } = useApi();
const { connected: wsConnected, lastRequest } = useWebSocket();

const summary = ref<StatsSummary | null>(null);
const trend = ref<TrendPoint[]>([]);
const autoRefresh = ref(true);
let timer: ReturnType<typeof setInterval> | null = null;

async function refresh() {
  try {
    const [s, t] = await Promise.all([fetchStatsSummary(0), fetchTrend('hour', 1)]);
    summary.value = s;
    trend.value = t;
  } catch {}
}

function toggleAuto() {
  autoRefresh.value = !autoRefresh.value;
  if (autoRefresh.value) {
    timer = setInterval(refresh, 10_000);
  } else if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

watch(lastRequest, () => { if (autoRefresh.value) refresh(); });

onMounted(() => {
  refresh();
  timer = setInterval(refresh, 10_000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });

function fmtNum(n: number): string { return n.toLocaleString(); }
function fmtTs(ts: number): string { return new Date(ts).toLocaleString('zh-CN'); }
</script>
