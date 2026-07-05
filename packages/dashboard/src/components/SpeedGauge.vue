<template>
  <div class="speed-gauge">
    <div class="gauge-left">
      <div class="gauge-label">Current Latency</div>
      <div class="gauge-value" :class="latencyClass">{{ displayLatency }}</div>
      <div class="gauge-status">{{ statusText }}</div>
    </div>
    <div class="gauge-right">
      <svg v-if="sparkPts" class="sparkline" viewBox="0 0 200 60">
        <polyline :points="sparkPts" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <div v-else class="no-data">No data</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SpeedRecord } from '../types';

const props = defineProps<{
  speedHistory: SpeedRecord[];
  currentLatency: number | null;
  loading: boolean;
}>();

const displayLatency = computed(() => {
  if (props.currentLatency === null) return '--';
  return `${props.currentLatency}ms`;
});

const latencyClass = computed(() => {
  if (props.currentLatency === null) return '';
  if (props.currentLatency < 500) return 'latency-good';
  if (props.currentLatency < 1000) return 'latency-warn';
  return 'latency-bad';
});

const statusText = computed(() => {
  if (props.currentLatency === null) return 'Connecting...';
  if (props.currentLatency < 300) return 'Excellent';
  if (props.currentLatency < 600) return 'Good';
  if (props.currentLatency < 1000) return 'Slow';
  return 'Very Slow';
});

const sparkPts = computed((): string => {
  const recent = props.speedHistory.slice(-20);
  if (recent.length < 2) return '';
  const max = Math.max(...recent.map(r => r.latency_ms), 1);
  return recent.map((r, i) => {
    const x = (i / (recent.length - 1)) * 200;
    const y = 60 - (r.latency_ms / max) * 50;
    return `${x},${y}`;
  }).join(' ');
});
</script>

<style scoped>
.speed-gauge {
  display: flex; align-items: center; gap: 32px;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px;
}
.gauge-left { min-width: 160px; }
.gauge-label { font-size: 13px; color: var(--text-secondary); margin-bottom: 4px; }
.gauge-value { font-size: 40px; font-weight: 700; font-variant-numeric: tabular-nums; }
.gauge-status { font-size: 14px; margin-top: 4px; }
.latency-good { color: #22c55e; }
.latency-warn { color: #eab308; }
.latency-bad { color: #ef4444; }
.gauge-right { flex: 1; }
.sparkline { width: 100%; height: 60px; }
.no-data { color: var(--text-secondary); font-size: 14px; text-align: center; }
</style>
