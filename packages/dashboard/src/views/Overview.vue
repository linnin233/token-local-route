<template>
  <div>
    <h1>统计总览</h1>

    <div v-if="loading && !summary">加载中...</div>
    <div v-else-if="error">{{ error }}</div>
    <div v-else-if="summary">
      <h2>汇总</h2>
      <table border="1" cellpadding="6" cellspacing="0">
        <tbody>
          <tr><td><b>总请求数</b></td><td>{{ summary.total_requests }}</td></tr>
          <tr><td><b>输入 Token</b></td><td>{{ fmtNum(summary.total_input_tokens) }}</td></tr>
          <tr><td><b>输出 Token</b></td><td>{{ fmtNum(summary.total_output_tokens) }}</td></tr>
          <tr><td><b>总 Token</b></td><td>{{ fmtNum(summary.total_tokens) }}</td></tr>
          <tr><td><b>总费用</b></td><td>${{ summary.total_cost_usd.toFixed(6) }}</td></tr>
          <tr><td><b>平均延迟</b></td><td>{{ summary.avg_latency_ms }}ms</td></tr>
          <tr><td><b>平均首字节</b></td><td>{{ summary.avg_ttfb_ms }}ms</td></tr>
          <tr><td><b>错误率</b></td><td>{{ summary.error_count }} ({{ summary.error_rate.toFixed(1) }}%)</td></tr>
        </tbody>
      </table>

      <h2>按模型统计</h2>
      <table v-if="summary.models.length" border="1" cellpadding="6" cellspacing="0">
        <thead><tr><th>模型</th><th>请求数</th><th>Token</th><th>费用</th></tr></thead>
        <tbody>
          <tr v-for="m in summary.models" :key="m.model">
            <td>{{ m.model }}</td>
            <td>{{ fmtNum(m.requests) }}</td>
            <td>{{ fmtNum(m.tokens) }}</td>
            <td>${{ m.cost.toFixed(6) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else>暂无数据</p>

      <h2>趋势数据</h2>
      <table v-if="trend.length" border="1" cellpadding="6" cellspacing="0">
        <thead><tr><th>时间</th><th>模型</th><th>请求</th><th>输入Token</th><th>输出Token</th><th>延迟</th><th>费用</th></tr></thead>
        <tbody>
          <tr v-for="t in trend" :key="t.ts + t.model">
            <td>{{ fmtTs(t.ts) }}</td>
            <td>{{ t.model }}</td>
            <td>{{ t.requests }}</td>
            <td>{{ fmtNum(t.input_tokens) }}</td>
            <td>{{ fmtNum(t.output_tokens) }}</td>
            <td>{{ t.avg_latency_ms }}ms</td>
            <td>${{ (t.cost_usd ?? 0).toFixed(6) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else>暂无趋势数据</p>
    </div>
    <p v-else>无数据</p>

    <p>
      <button @click="refresh">刷新</button>
      <button @click="toggleAuto">{{ autoRefresh ? '停止自动刷新' : '自动刷新' }}</button>
      <span v-if="wsConnected"> 实时</span>
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
  if (autoRefresh.value) timer = setInterval(refresh, 10_000);
  else if (timer) { clearInterval(timer); timer = null; }
}

watch(lastRequest, () => { if (autoRefresh.value) refresh(); });

onMounted(() => { refresh(); timer = setInterval(refresh, 10_000); });
onUnmounted(() => { if (timer) clearInterval(timer); });

function fmtNum(n: number): string { return n.toLocaleString(); }
function fmtTs(ts: number): string { return new Date(ts).toLocaleString('zh-CN'); }
</script>
