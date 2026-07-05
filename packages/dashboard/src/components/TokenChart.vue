<template>
  <div class="chart-container">
    <div v-if="loading" class="chart-placeholder">Loading chart...</div>
    <div v-else-if="chartData.labels.length === 0" class="chart-placeholder">No data yet — send some API requests first</div>
    <Line v-else :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import type { TrendPoint } from '../types';

// Register required Chart.js components globally
ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend);

const props = defineProps<{ data: TrendPoint[]; loading: boolean }>();

/** Merge all points by timestamp (sum tokens across models at the same ts). */
const aggregated = computed(() => {
  const byTs = new Map<number, { input: number; output: number }>();
  for (const p of props.data) {
    const cur = byTs.get(p.ts) ?? { input: 0, output: 0 };
    cur.input += p.input_tokens ?? 0;
    cur.output += p.output_tokens ?? 0;
    byTs.set(p.ts, cur);
  }
  const sorted = [...byTs.entries()].sort((a, b) => a[0] - b[0]);
  return sorted.map(([ts, v]) => ({ ts, ...v }));
});

/** Choose a label format based on the overall time span of the data. */
function formatTime(ts: number, spanMs: number): string {
  const d = new Date(ts);
  if (spanMs > 24 * 60 * 60 * 1000) {
    // Range > 24 h → show MM/DD
    return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
  }
  // Within a day → show HH:mm
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

const chartData = computed(() => {
  const pts = aggregated.value;
  if (pts.length === 0) return { labels: [], datasets: [] };

  const span = pts[pts.length - 1].ts - pts[0].ts;

  return {
    labels: pts.map((p) => formatTime(p.ts, span)),
    datasets: [
      {
        label: 'Input Tokens',
        data: pts.map((p) => p.input),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.12)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 4,
      },
      {
        label: 'Output Tokens',
        data: pts.map((p) => p.output),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.12)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 4,
      },
    ],
  };
});

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: {
      position: 'top' as const,
      align: 'end' as const,
      labels: {
        color: '#e2e8f0',   // white-ish text
        boxWidth: 12,
        padding: 16,
        font: { size: 12 },
      },
    },
    tooltip: {
      backgroundColor: '#0f172a',
      titleColor: '#e2e8f0',
      bodyColor: '#94a3b8',
      borderColor: '#1e293b',
      borderWidth: 1,
      padding: 10,
      displayColors: true,
      callbacks: {
        label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}`,
      },
    },
  },
  scales: {
    x: {
      ticks: {
        color: '#64748b',
        maxTicksLimit: 12,
        font: { size: 11 },
      },
      grid: {
        color: '#1e293b',
      },
    },
    y: {
      ticks: {
        color: '#64748b',
        font: { size: 11 },
        callback: (v: any) => Number(v).toLocaleString(),
      },
      grid: {
        color: '#1e293b',
      },
      beginAtZero: true,
    },
  },
}));
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 300px;
  position: relative;
}
.chart-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary, #64748b);
  font-size: 14px;
}
</style>
