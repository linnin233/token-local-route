<template>
  <div class="request-log">
    <h2 class="page-title">Request Log</h2>

    <div class="live-indicator">
      <span :class="['dot', connected ? 'dot-green' : 'dot-red']"></span>
      {{ connected ? 'Live — receiving real-time updates' : 'WebSocket disconnected' }}
      <span v-if="lastRequest" class="last-req">
        Last: {{ lastRequest.model }} — {{ lastRequest.total_tokens }} tokens
      </span>
    </div>

    <RequestTable
      :data="requests"
      :total="total"
      :page="page"
      :limit="50"
      :loading="loading"
      @page-change="(p) => { page = p; fetchData(); }"
      @filter-change="onFilterChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import RequestTable from '../components/RequestTable.vue';
import { useApi } from '../composables/useApi';
import { useWebSocket } from '../composables/useWebSocket';
import type { RequestRecord } from '../types';

const { loading, fetchRequests } = useApi();
const { connected, lastRequest } = useWebSocket();

const requests = ref<RequestRecord[]>([]);
const total = ref(0);
const page = ref(1);
const filters = ref<Record<string, string>>({});

async function fetchData() {
  try {
    const result = await fetchRequests({ page: page.value, limit: 50, ...filters.value });
    requests.value = result.data;
    total.value = result.total;
  } catch { /* silent */ }
}

function onFilterChange(f: Record<string, string>) {
  filters.value = f;
  page.value = 1;
  fetchData();
}

// When WS pushes a new request, prepend to the list
watch(lastRequest, (req) => {
  if (req) {
    requests.value.unshift(req);
    total.value++;
    // Keep list bounded
    if (requests.value.length > 50) requests.value.pop();
  }
});

onMounted(() => fetchData());
</script>

<style scoped>
.request-log { max-width: 1200px; }
.page-title { font-size: 22px; font-weight: 600; margin-bottom: 16px; }
.live-indicator { font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot-green { background: #22c55e; }
.dot-red { background: #ef4444; }
.last-req { margin-left: auto; font-size: 12px; }
</style>
