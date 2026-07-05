<template>
  <div>
    <h1>Config</h1>
    <div v-if="loading">Loading...</div>
    <div v-else-if="!cfg">No config</div>
    <div v-else>
      <h2>Providers</h2>
      <table border="1" cellpadding="6" cellspacing="0">
        <thead><tr><th>Name</th><th>Base URL</th><th>Type</th><th>API Key</th><th>Actions</th></tr></thead>
        <tbody>
          <tr v-for="(p,name) in cfg.providers" :key="name">
            <td><b>{{ name }}</b></td>
            <td>{{ p.baseUrl }}</td>
            <td>{{ p.apiType }}</td>
            <td>{{ p.apiKey }}</td>
            <td><button @click="delProvider(name)">Delete</button></td>
          </tr>
        </tbody>
      </table>

      <h3>Add Provider</h3>
      <p>
        Name: <input v-model="pf.name" size="12" />
        Base URL: <input v-model="pf.baseUrl" size="30" />
        API Key: <input v-model="pf.apiKey" size="40" />
        Type: <select v-model="pf.apiType"><option>openai</option><option>anthropic</option></select>
        <button @click="addProvider">Add</button>
      </p>

      <h2>Routes</h2>
      <table border="1" cellpadding="6" cellspacing="0">
        <thead><tr><th>Model</th><th>Provider</th><th>Actions</th></tr></thead>
        <tbody>
          <tr v-for="r in cfg.routes" :key="r.model+r.provider">
            <td>{{ r.model }}</td>
            <td>{{ r.provider }}</td>
            <td><button @click="delRoute(r)">Delete</button></td>
          </tr>
        </tbody>
      </table>

      <h3>Add Route</h3>
      <p>
        Model: <input v-model="rf.model" size="20" placeholder="deepseek-*" />
        Provider: <select v-model="rf.provider">
          <option v-for="(_,n) in cfg.providers" :key="n" :value="n">{{ n }}</option>
        </select>
        <button @click="addRoute">Add</button>
      </p>

      <h2>Default Provider</h2>
      <p>
        <select v-model="cfg.defaultProvider" @change="setDefault(cfg.defaultProvider)">
          <option v-for="(_,n) in cfg.providers" :key="n" :value="n">{{ n }}</option>
        </select>
        <button @click="setDefault(cfg.defaultProvider)">Save</button>
      </p>

      <p><button @click="refresh">Refresh</button> <span v-if="msg">{{ msg }}</span></p>
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
  pf.name=pf.baseUrl=pf.apiKey=''; pf.apiType='openai'; msg.value='Provider added'; refresh();
}

async function delProvider(name:string) {
  if(!confirm('Delete provider '+name+'? This also removes its routes.')) return;
  await fetch('/api/config/provider/'+name,{method:'DELETE'});
  msg.value='Provider deleted'; refresh();
}

async function addRoute() {
  if(!rf.model||!rf.provider) return;
  await fetch('/api/config/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...rf})});
  rf.model=rf.provider=''; msg.value='Route added'; refresh();
}

async function delRoute(r:R) {
  await fetch('/api/config/route',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(r)});
  msg.value='Route deleted'; refresh();
}

async function setDefault(p:string) {
  await fetch('/api/config/default-provider',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:p})});
  msg.value='Default saved'; refresh();
}

onMounted(refresh);
</script>
