<template>
  <div>
    <h1>测速</h1>
    <h2>当前延迟: <b>{{ currentLatency !== null ? currentLatency + 'ms' : '--' }}</b></h2>
    <h3>最近记录</h3>
    <table v-if="speedData.length" border="1" cellpadding="6" cellspacing="0">
      <thead><tr><th>时间</th><th>目标</th><th>延迟</th><th>首字节</th><th>状态</th></tr></thead>
      <tbody>
        <tr v-for="s in speedData.slice(0, 30)" :key="s.id">
          <td>{{ new Date(s.timestamp).toLocaleString('zh-CN') }}</td>
          <td>{{ s.target_url }}</td>
          <td>{{ s.latency_ms }}ms</td>
          <td>{{ s.ttfb_ms }}ms</td>
          <td>{{ s.success ? 'OK' : 'FAIL' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else>暂无数据</p>
    <p><button @click="refresh">刷新</button></p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useApi } from '../composables/useApi';
import type { SpeedRecord } from '../types';
const { loading, fetchSpeed } = useApi();
const speedData = ref<SpeedRecord[]>([]);
let t: ReturnType<typeof setInterval> | null = null;
const currentLatency = computed(() => speedData.value[0]?.latency_ms ?? null);
async function refresh() { try { speedData.value = await fetchSpeed(50); } catch {} }
onMounted(() => { refresh(); t = setInterval(refresh, 5000); });
onUnmounted(() => { if (t) clearInterval(t); });
</script>
