<template>
  <div>
    <h1>Overview</h1>
    <div v-if="loading && !summary">Loading...</div>
    <div v-else-if="error">{{ error }}</div>
    <div v-else-if="summary">
      <h2>Summary</h2>
      <table border="1" cellpadding="6" cellspacing="0">
        <tbody>
          <tr><td><b>Requests</b></td><td>{{ summary.total_requests }}</td></tr>
          <tr><td><b>Input Tokens</b></td><td>{{ fmt(summary.total_input_tokens) }}</td></tr>
          <tr><td><b>Output Tokens</b></td><td>{{ fmt(summary.total_output_tokens) }}</td></tr>
          <tr><td><b>Total Tokens</b></td><td>{{ fmt(summary.total_tokens) }}</td></tr>
          <tr><td><b>Cost</b></td><td>${{ summary.total_cost_usd.toFixed(6) }}</td></tr>
          <tr><td><b>Avg Latency</b></td><td>{{ summary.avg_latency_ms }}ms</td></tr>
          <tr><td><b>Avg TTFB</b></td><td>{{ summary.avg_ttfb_ms }}ms</td></tr>
          <tr><td><b>Errors</b></td><td>{{ summary.error_count }} ({{ summary.error_rate.toFixed(1) }}%)</td></tr>
        </tbody>
      </table>

      <h2>Per Model</h2>
      <table v-if="summary.models.length" border="1" cellpadding="6" cellspacing="0">
        <thead><tr><th>Model</th><th>Requests</th><th>Tokens</th><th>Cost</th></tr></thead>
        <tbody>
          <tr v-for="m in summary.models" :key="m.model">
            <td>{{ m.model }}</td><td>{{ fmt(m.requests) }}</td><td>{{ fmt(m.tokens) }}</td><td>${{ m.cost.toFixed(6) }}</td>
          </tr>
        </tbody>
      </table>

      <h2>Trend</h2>
      <table v-if="trend.length" border="1" cellpadding="6" cellspacing="0">
        <thead><tr><th>Time</th><th>Model</th><th>Requests</th><th>Input</th><th>Output</th><th>Latency</th><th>Cost</th></tr></thead>
        <tbody>
          <tr v-for="t in trend" :key="t.ts + t.model">
            <td>{{ ts(t.ts) }}</td><td>{{ t.model }}</td><td>{{ t.requests }}</td>
            <td>{{ fmt(t.input_tokens) }}</td><td>{{ fmt(t.output_tokens) }}</td>
            <td>{{ t.avg_latency_ms }}ms</td><td>${{ (t.cost_usd ?? 0).toFixed(6) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p><button @click="refresh">Refresh</button></p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useApi } from '../composables/useApi';
import type { StatsSummary, TrendPoint } from '../types';

const { loading, error, fetchStatsSummary, fetchTrend } = useApi();
const summary = ref<StatsSummary | null>(null);
const trend = ref<TrendPoint[]>([]);
let timer: ReturnType<typeof setInterval> | null = null;

async function refresh() {
  try { const [s, t] = await Promise.all([fetchStatsSummary(0), fetchTrend('hour', 1)]); summary.value = s; trend.value = t; } catch {}
}
onMounted(() => { refresh(); timer = setInterval(refresh, 10000); });
onUnmounted(() => { if (timer) clearInterval(timer); });
function fmt(n: number): string { return n.toLocaleString(); }
function ts(n: number): string { return new Date(n).toLocaleString('zh-CN'); }
</script>
