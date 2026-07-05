<template>
  <div>
    <h1>Overview</h1>
    <div v-if="loading && !s">Loading...</div>
    <div v-else-if="error">{{ error }}</div>
    <div v-else-if="s">
      <h2>Summary</h2>
      <table border="1" cellpadding="6" cellspacing="0">
        <tbody>
          <tr><td><b>Requests</b></td><td>{{ s.total_requests }}</td></tr>
          <tr><td><b>Input Tokens</b></td><td>{{ fmt(s.total_input_tokens) }}</td></tr>
          <tr><td><b>Output Tokens</b></td><td>{{ fmt(s.total_output_tokens) }}</td></tr>
          <tr><td><b>Total Tokens</b></td><td>{{ fmt(s.total_tokens) }}</td></tr>
          <tr><td><b>Cost</b></td><td>${{ s.total_cost_usd.toFixed(6) }}</td></tr>
          <tr><td><b>Avg Latency</b></td><td>{{ s.avg_latency_ms }}ms</td></tr>
          <tr><td><b>Avg TTFB</b></td><td>{{ s.avg_ttfb_ms }}ms</td></tr>
          <tr><td><b>Errors</b></td><td>{{ s.error_count }} ({{ s.error_rate.toFixed(1) }}%)</td></tr>
        </tbody>
      </table>
      <h2>Models</h2>
      <table v-if="s.models.length" border="1" cellpadding="6" cellspacing="0">
        <thead><tr><th>Model</th><th>Requests</th><th>Tokens</th><th>Cost</th></tr></thead>
        <tbody><tr v-for="m in s.models" :key="m.model"><td>{{ m.model }}</td><td>{{ fmt(m.requests) }}</td><td>{{ fmt(m.tokens) }}</td><td>${{ m.cost.toFixed(6) }}</td></tr></tbody>
      </table>
      <h2>Trend</h2>
      <table v-if="t.length" border="1" cellpadding="6" cellspacing="0">
        <thead><tr><th>Time</th><th>Model</th><th>Req</th><th>Input</th><th>Output</th><th>Latency</th><th>Cost</th></tr></thead>
        <tbody><tr v-for="p in t" :key="p.ts+p.model"><td>{{ ts(p.ts) }}</td><td>{{ p.model }}</td><td>{{ p.requests }}</td><td>{{ fmt(p.input_tokens) }}</td><td>{{ fmt(p.output_tokens) }}</td><td>{{ p.avg_latency_ms }}ms</td><td>${{ (p.cost_usd??0).toFixed(6) }}</td></tr></tbody>
      </table>
    </div>
    <p><button @click="refresh">Refresh</button></p>
  </div>
</template>

<script setup lang="ts">
import { ref,onMounted,onUnmounted } from 'vue';
import { useApi } from '../composables/useApi';
import type { StatsSummary,TrendPoint } from '../types';
const {loading,error,fetchStatsSummary,fetchTrend}=useApi();
const s=ref<StatsSummary|null>(null), t=ref<TrendPoint[]>([]);
let tm:ReturnType<typeof setInterval>|null=null;
async function refresh(){try{const[a,b]=await Promise.all([fetchStatsSummary(0),fetchTrend('hour',1)]);s.value=a;t.value=b;}catch{}}
onMounted(()=>{refresh();tm=setInterval(refresh,10000);});
onUnmounted(()=>{if(tm)clearInterval(tm);});
function fmt(n:number):string{return n.toLocaleString();}
function ts(n:number):string{return new Date(n).toLocaleString('zh-CN');}
</script>
