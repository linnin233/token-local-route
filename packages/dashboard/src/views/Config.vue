<template>
  <div>
    <h1>配置</h1>
    <div v-if="loading">加载中...</div>
    <div v-else-if="!cfg">无配置</div>
    <div v-else>
      <h2>提供商</h2>
      <table border="1" cellpadding="6" cellspacing="0">
        <thead><tr><th>名称</th><th>Base URL</th><th>类型</th><th>API Key</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="(p,name) in cfg.providers" :key="name">
            <td><b>{{ name }}</b></td>
            <td>{{ p.baseUrl }}</td>
            <td>{{ p.apiType }}</td>
            <td>{{ p.apiKey }}</td>
            <td><button @click="delProvider(name)">删除</button></td>
          </tr>
        </tbody>
      </table>

      <h3>添加提供商</h3>
      <p>
        名称: <input v-model="pf.name" size="12" />
        Base URL: <input v-model="pf.baseUrl" size="30" />
        API Key: <input v-model="pf.apiKey" size="40" />
        类型: <select v-model="pf.apiType"><option>openai</option><option>anthropic</option></select>
        <button @click="addProvider">添加</button>
      </p>

      <h2>路由规则</h2>
      <table border="1" cellpadding="6" cellspacing="0">
        <thead><tr><th>模型</th><th>提供商</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="r in cfg.routes" :key="r.model+r.provider">
            <td>{{ r.model }}</td>
            <td>{{ r.provider }}</td>
            <td><button @click="delRoute(r)">删除</button></td>
          </tr>
        </tbody>
      </table>

      <h3>添加路由</h3>
      <p>
        模型: <input v-model="rf.model" size="20" placeholder="deepseek-*" />
        提供商: <select v-model="rf.provider">
          <option v-for="(_,n) in cfg.providers" :key="n" :value="n">{{ n }}</option>
        </select>
        <button @click="addRoute">添加</button>
      </p>

      <h2>默认提供商</h2>
      <p>
        <select v-model="cfg.defaultProvider" @change="setDefault(cfg.defaultProvider)">
          <option v-for="(_,n) in cfg.providers" :key="n" :value="n">{{ n }}</option>
        </select>
        <button @click="setDefault(cfg.defaultProvider)">保存</button>
      </p>

      <p><button @click="refresh">刷新</button> <span v-if="msg">{{ msg }}</span></p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';

interface P { baseUrl:string; anthropicUrl?:string; apiType:string; apiKey:string }
interface R { model:string; provider:string }
interface C { proxy:{port:number;host:string}; proxyKey:string; providers:Record<string,P>; routes:R[]; defaultProvider:string }

const cfg = ref<C|null>(null);
const loading = ref(false);
const msg = ref('');

const pf = reactive({ name:'', baseUrl:'', apiKey:'', apiType:'openai' });
const rf = reactive({ model:'', provider:'' });

async function refresh() {
  loading.value=true;
  try { const r=await fetch('/api/config'); cfg.value=await r.json(); } catch {}
  finally { loading.value=false; }
}

async function addProvider() {
  if(!pf.name||!pf.baseUrl) return;
  await fetch('/api/config/provider',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...pf})});
  pf.name=pf.baseUrl=pf.apiKey=''; pf.apiType='openai'; msg.value='已添加'; refresh();
}

async function delProvider(name:string) {
  if(!confirm('确定删除提供商 '+name+'? 关联的路由也会被删除。')) return;
  await fetch('/api/config/provider/'+name,{method:'DELETE'});
  msg.value='已删除'; refresh();
}

async function addRoute() {
  if(!rf.model||!rf.provider) return;
  await fetch('/api/config/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...rf})});
  rf.model=rf.provider=''; msg.value='路由已添加'; refresh();
}

async function delRoute(r:R) {
  await fetch('/api/config/route',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(r)});
  msg.value='路由已删除'; refresh();
}

async function setDefault(p:string) {
  await fetch('/api/config/default-provider',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:p})});
  msg.value='已保存'; refresh();
}

onMounted(refresh);
</script>
