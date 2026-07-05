<template>
  <div>
    <h1>📋 请求日志</h1>

    <p>
      <span v-if="wsConnected">🔗 实时连接中</span>
      <span v-else>⚠️ 未连接</span>
    </p>

    <p>
      模型: <input v-model="filters.model" @input="onFilter" size="15" placeholder="例: deepseek-chat" />
      状态: <select v-model="filters.status" @change="onFilter">
        <option value="">全部</option>
        <option value="2xx">2xx 成功</option>
        <option value="4xx">4xx 客户端错误</option>
        <option value="5xx">5xx 服务端错误</option>
      </select>
      类型: <select v-model="filters.stream" @change="onFilter">
        <option value="">全部</option>
        <option value="1">流式</option>
        <option value="0">非流式</option>
      </select>
      来源: <input v-model="filters.app_source" @input="onFilter" size="12" placeholder="例: claude-code" />
      <button @click="fetchData">搜索</button>
    </p>

    <div v-if="loading">加载中...</div>
    <div v-else-if="error">{{ error }}</div>
    <table v-else-if="requests.length" border="1" cellpadding="6" cellspacing="0">
      <thead>
        <tr>
          <th>ID</th><th>时间</th><th>模型</th><th>类型</th><th>状态码</th>
          <th>输入Token</th><th>输出Token</th><th>延迟</th><th>首字节</th><th>费用</th><th>来源</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in requests" :key="r.id">
          <td>{{ r.id }}</td>
          <td>{{ new Date(r.timestamp).toLocaleString('zh-CN') }}</td>
          <td>{{ r.model }}</td>
          <td>{{ r.stream ? '流式' : '非流式' }}</td>
          <td>{{ r.status_code || '错误' }}</td>
          <td>{{ r.input_tokens.toLocaleString() }}</td>
          <td>{{ r.output_tokens.toLocaleString() }}</td>
          <td>{{ r.latency_ms }}ms</td>
          <td>{{ r.ttfb_ms }}ms</td>
          <td>${{ r.cost_usd.toFixed(6) }}</td>
          <td>{{ r.app_source }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else>暂无请求记录</p>

    <p v-if="total > 50">
      第 {{ page }} 页 / 共 {{ Math.ceil(total / 50) }} 页
      <button :disabled="page <= 1" @click="page--; fetchData()">上一页</button>
      <button :disabled="page * 50 >= total" @click="page++; fetchData()">下一页</button>
    </p>

    <p><button @click="fetchData">刷新</button></p>
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
