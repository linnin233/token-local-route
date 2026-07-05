<template>
  <div class="speed-test">
    <h2 class="page-title">Speed Test</h2>

    <SpeedGauge
      :speed-history="speedData"
      :current-latency="currentLatency"
      :loading="loading"
    />

    <!-- Speed history chart -->
    <div class="chart-card" style="margin-top: 24px;">
      <h3>Latency History</h3>
      <canvas v-if="speedData.length > 0" ref="chartCanvas"></canvas>
      <div v-else class="no-data">No speed test data yet</div>
    </div>

    <!-- Recent tests table -->
    <div class="section" v-if="speedData.length > 0">
      <h3>Recent Tests</h3>
      <table class="speed-table">
        <thead>
          <tr><th>Time</th><th>Target</th><th class="num">Latency</th><th class="num">TTFB</th><th>Status</th></tr>
        </thead>
        <tbody>
          <tr v-for="s in speedData.slice(0, 20)" :key="s.id">
            <td class="time">{{ new Date(s.timestamp).toLocaleTimeString('zh-CN') }}</td>
            <td>{{ s.target_url }}</td>
            <td class="num">{{ s.latency_ms }}ms</td>
            <td class="num">{{ s.ttfb_ms }}ms</td>
            <td><span :class="['badge', s.success ? 'badge-green' : 'badge-red']">{{ s.success ? 'OK' : 'FAIL' }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import SpeedGauge from '../components/SpeedGauge.vue';
import { useApi } from '../composables/useApi';
import type { SpeedRecord } from '../types';
import {
  Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend,
} from 'chart.js';
Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

const { loading, fetchSpeed } = useApi();
const speedData = ref<SpeedRecord[]>([]);
const chartCanvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

const currentLatency = computed(() => {
  if (speedData.value.length === 0) return null;
  return speedData.value[0].latency_ms;
});

async function refresh() {
  try {
    speedData.value = await fetchSpeed(100);
  } catch { /* silent */ }
}

function updateChart() {
  if (!chartCanvas.value || speedData.value.length < 2) return;
  const data = [...speedData.value].reverse().slice(-60); // last 60 points
  const labels = data.map(s => new Date(s.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
  const values = data.map(s => s.latency_ms);

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.update();
    return;
  }

  chart = new Chart(chartCanvas.value, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Latency (ms)',
        data: values,
        borderColor: '#3b82f6',
        pointRadius: 1.5,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        x: { ticks: { color: '#64748b', maxTicksLimit: 10 }, grid: { color: '#1e293b' } },
        y: { ticks: { color: '#64748b', callback: (v: any) => v + 'ms' }, grid: { color: '#1e293b' }, beginAtZero: true },
      },
    },
  });
}

watch(speedData, async () => { await nextTick(); updateChart(); });

onMounted(() => {
  refresh();
  refreshTimer = setInterval(refresh, 5000);
});
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer); });
</script>

<style scoped>
.speed-test { max-width: 1000px; }
.page-title { font-size: 22px; font-weight: 600; margin-bottom: 24px; }
.chart-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; height: 320px; }
.chart-card h3 { font-size: 15px; color: var(--text-secondary); margin: 0 0 16px 0; }
.no-data { padding: 40px; text-align: center; color: var(--text-secondary); }
.section { margin-top: 24px; }
.section h3 { font-size: 15px; color: var(--text-secondary); margin-bottom: 12px; }
.speed-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.speed-table th { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); color: var(--text-secondary); font-weight: 600; }
.speed-table td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.time { color: var(--text-secondary); font-size: 12px; }
.badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 500; }
.badge-green { background: rgba(34,197,94,0.15); color: #22c55e; }
.badge-red { background: rgba(239,68,68,0.15); color: #ef4444; }
canvas { width: 100% !important; height: 100% !important; }
</style>
