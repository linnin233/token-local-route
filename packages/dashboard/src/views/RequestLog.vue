<template>
  <div>
    <h1>Request Log</h1>

    <p>
      <span v-if="wsConnected">🔗 Live</span>
      <span v-else>⚠️ Disconnected</span>
    </p>

    <p>
      Model: <input v-model="filters.model" @input="onFilter" size="15" placeholder="e.g. deepseek-chat" />
      Status: <select v-model="filters.status" @change="onFilter">
        <option value="">All</option>
        <option value="2xx">2xx</option>
        <option value="4xx">4xx</option>
        <option value="5xx">5xx</option>
      </select>
      Type: <select v-model="filters.stream" @change="onFilter">
        <option value="">All</option>
        <option value="1">Stream</option>
        <option value="0">Batch</option>
      </select>
      Source: <input v-model="filters.app_source" @input="onFilter" size="12" placeholder="e.g. claude-code" />
      <button @click="fetchData">Search</button>
    </p>

    <div v-if="loading">Loading...</div>
    <div v-else-if="error">{{ error }}</div>
    <table v-else-if="requests.length" border="1" cellpadding="6" cellspacing="0">
      <tr>
        <th>ID</th><th>Time</th><th>Model</th><th>Type</th><th>Status</th>
        <th>Input</th><th>Output</th><th>Latency</th><th>TTFB</th><th>Cost</th><th>Source</th>
      </tr>
      <tr v-for="r in requests" :key="r.id">
        <td>{{ r.id }}</td>
        <td>{{ new Date(r.timestamp).toLocaleString('zh-CN') }}</td>
        <td>{{ r.model }}</td>
        <td>{{ r.stream ? 'Stream' : 'Batch' }}</td>
        <td>{{ r.status_code || 'ERR' }}</td>
        <td>{{ r.input_tokens.toLocaleString() }}</td>
        <td>{{ r.output_tokens.toLocaleString() }}</td>
        <td>{{ r.latency_ms }}ms</td>
        <td>{{ r.ttfb_ms }}ms</td>
        <td>${{ r.cost_usd.toFixed(6) }}</td>
        <td>{{ r.app_source }}</td>
      </tr>
    </table>
    <p v-else>No requests yet.</p>

    <p v-if="total > 50">
      Page {{ page }} of {{ Math.ceil(total / 50) }}
      <button :disabled="page <= 1" @click="page--; fetchData()">Prev</button>
      <button :disabled="page * 50 >= total" @click="page++; fetchData()">Next</button>
    </p>

    <p><button @click="fetchData">Refresh</button></p>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { useApi } from '../composables/useApi';
import { useWebSocket } from '../composables/useWebSocket';
import type { RequestRecord } from '../types';

const { loading, error, fetchRequests } = useApi();
const { connected: wsConnected, lastRequest } = useWebSocket();

const requests = ref<RequestRecord[]>([]);
const total = ref(0);
const page = ref(1);
const filters = reactive({ model: '', status: '', stream: '', app_source: '' });

async function fetchData() {
  try {
    const r = await fetchRequests({ page: page.value, limit: 50, ...filters });
    requests.value = r.data;
    total.value = r.total;
  } catch {}
}

function onFilter() {
  page.value = 1;
  fetchData();
}

watch(lastRequest, (req) => {
  if (req && page.value === 1) {
    requests.value.unshift(req);
    total.value++;
  }
});

onMounted(fetchData);
</script>
