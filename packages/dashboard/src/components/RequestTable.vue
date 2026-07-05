<template>
  <div class="table-wrapper">
    <!-- Filter bar -->
    <div class="filter-bar">
      <input v-model="filters.model" placeholder="Model..." class="filter-input" @input="emitFilters" />
      <select v-model="filters.status" class="filter-select" @change="emitFilters">
        <option value="">All Status</option>
        <option value="2xx">2xx Success</option>
        <option value="4xx">4xx Error</option>
        <option value="5xx">5xx Error</option>
      </select>
      <select v-model="filters.stream" class="filter-select" @change="emitFilters">
        <option value="">All Types</option>
        <option value="1">Streaming</option>
        <option value="0">Non-streaming</option>
      </select>
      <input v-model="filters.app_source" placeholder="App source..." class="filter-input" @input="emitFilters" />
    </div>

    <!-- Table -->
    <div v-if="loading" class="table-message">Loading...</div>
    <div v-else-if="data.length === 0" class="table-message">No requests recorded yet. Start making API calls through the proxy!</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Model</th>
          <th>Type</th>
          <th>Status</th>
          <th class="num">Input</th>
          <th class="num">Output</th>
          <th class="num">Latency</th>
          <th class="num">Cost</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in data" :key="r.id">
          <td class="time">{{ fmtTime(r.timestamp) }}</td>
          <td class="model">{{ r.model }}</td>
          <td><span :class="['badge', r.stream ? 'badge-blue' : 'badge-gray']">{{ r.stream ? 'Stream' : 'Batch' }}</span></td>
          <td><span :class="['badge', statusClass(r.status_code)]">{{ r.status_code || 'ERR' }}</span></td>
          <td class="num">{{ fmtNum(r.input_tokens) }}</td>
          <td class="num">{{ fmtNum(r.output_tokens) }}</td>
          <td class="num">{{ r.latency_ms }}ms</td>
          <td class="num">${{ r.cost_usd.toFixed(4) }}</td>
          <td>{{ r.app_source }}</td>
        </tr>
      </tbody>
    </table>

    <!-- Pagination -->
    <div v-if="total > limit" class="pagination">
      <button :disabled="page <= 1" @click="$emit('page-change', page - 1)">← Prev</button>
      <span>Page {{ page }} of {{ Math.ceil(total / limit) }}</span>
      <button :disabled="page * limit >= total" @click="$emit('page-change', page + 1)">Next →</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import type { RequestRecord } from '../types';

const props = defineProps<{
  data: RequestRecord[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
}>();

const emit = defineEmits<{
  'page-change': [page: number];
  'filter-change': [filters: Record<string, string>];
}>();

const filters = reactive({ model: '', status: '', stream: '', app_source: '' });

function emitFilters() {
  emit('filter-change', { ...filters });
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function fmtNum(n: number): string { return n.toLocaleString(); }
function statusClass(code: number): string {
  if (code >= 200 && code < 300) return 'badge-green';
  if (code >= 400 && code < 500) return 'badge-yellow';
  if (code >= 500) return 'badge-red';
  return 'badge-red';
}
</script>

<style scoped>
.table-wrapper { width: 100%; }
.filter-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.filter-input, .filter-select {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  outline: none;
}
.filter-input:focus, .filter-select:focus { border-color: var(--accent); }
.filter-input { width: 160px; }

.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th {
  text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border);
  color: var(--text-secondary); font-weight: 600; font-size: 12px; text-transform: uppercase;
}
.data-table td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
.data-table tr:hover { background: rgba(59, 130, 246, 0.05); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.time { white-space: nowrap; color: var(--text-secondary); font-size: 12px; }
.model { font-weight: 500; }

.badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 500; }
.badge-green { background: rgba(34,197,94,0.15); color: #22c55e; }
.badge-yellow { background: rgba(234,179,8,0.15); color: #eab308; }
.badge-red { background: rgba(239,68,68,0.15); color: #ef4444; }
.badge-blue { background: rgba(59,130,246,0.15); color: #3b82f6; }
.badge-gray { background: rgba(148,163,184,0.15); color: #94a3b8; }

.table-message { padding: 40px; text-align: center; color: var(--text-secondary); }

.pagination { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 16px; }
.pagination button {
  background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-primary);
  padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;
}
.pagination button:disabled { opacity: 0.4; cursor: default; }
.pagination button:hover:not(:disabled) { border-color: var(--accent); }
.pagination span { font-size: 13px; color: var(--text-secondary); }
</style>
