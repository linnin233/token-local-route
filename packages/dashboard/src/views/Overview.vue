<template>
  <div>
    <h1>总览</h1>
    <div v-if="loading && !s">加载中...</div>
    <div v-else-if="error">{{ error }}</div>
    <div v-else-if="s">
      <h2>汇总</h2>
      <table border="1" cellpadding="6" cellspacing="0">
        <tbody>
          <tr><td><b>总请求数</b></td><td>{{ s.total_requests }}</td></tr>
          <tr><td><b>输入Token</b></td><td>{{ fmt(s.total_input_tokens) }}</td></tr>
          <tr><td><b>输出Token</b></td><td>{{ fmt(s.total_output_tokens) }}</td></tr>
          <tr><td><b>总Token</b></td><td>{{ fmt(s.total_tokens) }}</td></tr>
          <tr><td><b>费用</b></td><td>${{ s.total_cost_usd.toFixed(6) }}</td></tr>
          <tr><td><b>平均延迟</b></td><td>{{ s.avg_latency_ms }}ms</td></tr>
          <tr><td><b>平均首字节</b></td><td>{{ s.avg_ttfb_ms }}ms</td></tr>
          <tr><td><b>错误数</b></td><td>{{ s.error_count }} ({{ s.error_rate.toFixed(1) }}%)</td></tr>
        </tbody>
      </table>
      <h2>按模型</h2>
      <table v-if="s.models.length" border="1" cellpadding="6" cellspacing="0">
        <thead><tr><th>模型</th><th>请求数</th><th>Token</th><th>费用</th></tr></thead>
        <tbody><tr v-for="m in s.models" :key="m.model"><td>{{ m.model }}</td><td>{{ fmt(m.requests) }}</td><td>{{ fmt(m.tokens) }}</td><td>${{ m.cost.toFixed(6) }}</td></tr></tbody>
      </table>
      <h2>趋势</h2>
      <table v-if="t.length" border="1" cellpadding="6" cellspacing="0">
        <thead><tr><th>时间</th><th>模型</th><th>请求</th><th>输入</th><th>输出</th><th>延迟</th><th>费用</th></tr></thead>
        <tbody><tr v-for="p in t" :key="p.ts+p.model"><td>{{ ts(p.ts) }}</td><td>{{ p.model }}</td><td>{{ p.requests }}</td><td>{{ fmt(p.input_tokens) }}</td><td>{{ fmt(p.output_tokens) }}</td><td>{{ p.avg_latency_ms }}ms</td><td>${{ (p.cost_usd??0).toFixed(6) }}</td></tr></tbody>
      </table>
    </div>
    <p><button @click="refresh">刷新</button></p>
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
