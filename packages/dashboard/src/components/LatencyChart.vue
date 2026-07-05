<template>
  <div class="chart-container">
    <div v-if="loading" class="chart-placeholder">Loading...</div>
    <div v-else-if="chartData.labels.length === 0" class="chart-placeholder">No data yet</div>
    <canvas v-else ref="canvasRef"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import {
  Chart, LineController, LineElement, PointElement, LinearScale,
  CategoryScale, Filler, Tooltip, Legend,
} from 'chart.js';
import type { TrendPoint } from '../types';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend);

const props = defineProps<{ data: TrendPoint[]; loading: boolean }>();
const canvasRef = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

const chartData = computed(() => {
  // Average latency across models per time point
  const byTs = new Map<number, { latencies: number[]; ttfb: number[] }>();
  for (const p of props.data) {
    const cur = byTs.get(p.ts) || { latencies: [], ttfb: [] };
    if (p.avg_latency_ms) cur.latencies.push(p.avg_latency_ms);
    byTs.set(p.ts, cur);
  }
  const sorted = [...byTs.entries()].sort((a, b) => a[0] - b[0]);
  return {
    labels: sorted.map(([ts]) => new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })),
    latency: sorted.map(([, v]) => avg(v.latencies)),
  };
});

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function createChart() {
  if (!canvasRef.value) return;
  if (chart) {
    chart.data.labels = chartData.value.labels;
    chart.data.datasets[0].data = chartData.value.latency;
    chart.update();
    return;
  }
  chart = new Chart(canvasRef.value, {
    type: 'line',
    data: {
      labels: chartData.value.labels,
      datasets: [{
        label: 'Latency (ms)',
        data: chartData.value.latency,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        x: { ticks: { color: '#64748b', maxTicksLimit: 12 }, grid: { color: '#1e293b' } },
        y: { ticks: { color: '#64748b', callback: (v) => `${v}ms` }, grid: { color: '#1e293b' }, beginAtZero: true },
      },
    },
  });
}

watch(() => [props.data, props.loading], async () => { await nextTick(); createChart(); });
onMounted(async () => { await nextTick(); createChart(); });
</script>

<style scoped>
.chart-container { width: 100%; height: 300px; position: relative; }
.chart-placeholder { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary); font-size: 14px; }
</style>
