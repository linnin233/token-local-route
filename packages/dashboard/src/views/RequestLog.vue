<template>
  <div>
    <h1>Request Log</h1>
    <p>
      Model: <input v-model="f.model" @input="go" size="15" />
      Status: <select v-model="f.status" @change="go"><option value="">All</option><option value="2xx">2xx</option><option value="4xx">4xx</option><option value="5xx">5xx</option></select>
      Type: <select v-model="f.stream" @change="go"><option value="">All</option><option value="1">Stream</option><option value="0">Batch</option></select>
      Source: <input v-model="f.app_source" @input="go" size="12" />
      <button @click="fetch">Search</button>
    </p>
    <div v-if="loading">Loading...</div>
    <div v-else-if="error">{{ error }}</div>
    <table v-else-if="d.length" border="1" cellpadding="6" cellspacing="0">
      <thead><tr><th>ID</th><th>Time</th><th>Model</th><th>Type</th><th>Status</th><th>Input</th><th>Output</th><th>Latency</th><th>TTFB</th><th>Cost</th><th>Source</th></tr></thead>
      <tbody><tr v-for="r in d" :key="r.id"><td>{{ r.id }}</td><td>{{ new Date(r.timestamp).toLocaleString('zh-CN') }}</td><td>{{ r.model }}</td><td>{{ r.stream?'Stream':'Batch' }}</td><td>{{ r.status_code||'ERR' }}</td><td>{{ r.input_tokens.toLocaleString() }}</td><td>{{ r.output_tokens.toLocaleString() }}</td><td>{{ r.latency_ms }}ms</td><td>{{ r.ttfb_ms }}ms</td><td>${{ r.cost_usd.toFixed(6) }}</td><td>{{ r.app_source }}</td></tr></tbody>
    </table>
    <p v-else>No requests yet.</p>
    <p v-if="total>50">Page {{ page }}/{{ Math.ceil(total/50) }} <button :disabled="page<=1" @click="page--;fetch()">Prev</button> <button :disabled="page*50>=total" @click="page++;fetch()">Next</button></p>
    <p><button @click="fetch">Refresh</button></p>
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
