<template>
  <div>
    <h1>请求日志</h1>
    <p>
      模型: <input v-model="f.model" @input="go" size="15" />
      状态: <select v-model="f.status" @change="go"><option value="">全部</option><option value="2xx">2xx</option><option value="4xx">4xx</option><option value="5xx">5xx</option></select>
      类型: <select v-model="f.stream" @change="go"><option value="">全部</option><option value="1">流式</option><option value="0">非流式</option></select>
      来源: <input v-model="f.app_source" @input="go" size="12" />
      <button @click="fetch">搜索</button>
    </p>
    <div v-if="loading">加载中...</div>
    <div v-else-if="error">{{ error }}</div>
    <table v-else-if="d.length" border="1" cellpadding="6" cellspacing="0">
      <thead><tr><th>ID</th><th>时间</th><th>模型</th><th>类型</th><th>状态</th><th>输入Token</th><th>输出Token</th><th>延迟</th><th>首字节</th><th>费用</th><th>来源</th></tr></thead>
      <tbody><tr v-for="r in d" :key="r.id"><td>{{ r.id }}</td><td>{{ new Date(r.timestamp).toLocaleString('zh-CN') }}</td><td>{{ r.model }}</td><td>{{ r.stream?'流式':'非流式' }}</td><td>{{ r.status_code||'ERR' }}</td><td>{{ r.input_tokens.toLocaleString() }}</td><td>{{ r.output_tokens.toLocaleString() }}</td><td>{{ r.latency_ms }}ms</td><td>{{ r.ttfb_ms }}ms</td><td>${{ r.cost_usd.toFixed(6) }}</td><td>{{ r.app_source }}</td></tr></tbody>
    </table>
    <p v-else>暂无请求记录</p>
    <p v-if="total>50">第{{ page }}/{{ Math.ceil(total/50) }}页 <button :disabled="page<=1" @click="page--;fetch()">上一页</button> <button :disabled="page*50>=total" @click="page++;fetch()">下一页</button></p>
    <p><button @click="fetch">刷新</button></p>
  </div>
</template>

<script setup lang="ts">
import {ref,reactive,onMounted,watch} from 'vue';
import {useApi} from '../composables/useApi';
import {useWebSocket} from '../composables/useWebSocket';
import type {RequestRecord} from '../types';
const {loading,error,fetchRequests}=useApi();
const {lastRequest}=useWebSocket();
const d=ref<RequestRecord[]>([]), total=ref(0), page=ref(1);
const f=reactive({model:'',status:'',stream:'',app_source:''});
async function fetch(){try{const r=await fetchRequests({page:page.value,limit:50,...f});d.value=r.data;total.value=r.total;}catch{}}
function go(){page.value=1;fetch();}
watch(lastRequest,(r)=>{if(r&&page.value===1){d.value.unshift(r);total.value++;}});
onMounted(fetch);
</script>
