<template>
  <div>
    <h1>Speed Test</h1>

    <div v-if="loading && speedData.length === 0">Loading...</div>
    <div v-else>
      <h2>
        Current Latency:
        <b v-if="currentLatency !== null">{{ currentLatency }}ms</b>
        <b v-else>--</b>
      </h2>

      <h3>Recent Tests</h3>
      <table v-if="speedData.length" border="1" cellpadding="6" cellspacing="0">
        <tr><th>Time</th><th>Target</th><th>Latency</th><th>TTFB</th><th>Status</th></tr>
        <tr v-for="s in speedData.slice(0, 30)" :key="s.id">
          <td>{{ new Date(s.timestamp).toLocaleString('zh-CN') }}</td>
          <td>{{ s.target_url }}</td>
          <td>{{ s.latency_ms }}ms</td>
          <td>{{ s.ttfb_ms }}ms</td>
          <td>{{ s.success ? '✅ OK' : '❌ FAIL' }}</td>
        </tr>
      </table>
      <p v-else>No speed test data yet.</p>
    </div>

    <p><button @click="refresh">Refresh</button></p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useApi } from '../composables/useApi';
import type { SpeedRecord } from '../types';

const { loading, fetchSpeed } = useApi();
const speedData = ref<SpeedRecord[]>([]);
let timer: ReturnType<typeof setInterval> | null = null;

const currentLatency = computed(() => {
  if (speedData.value.length === 0) return null;
  return speedData.value[0].latency_ms;
});

async function refresh() {
  try { speedData.value = await fetchSpeed(50); } catch {}
}

onMounted(() => {
  refresh();
  timer = setInterval(refresh, 5000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>
