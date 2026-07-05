<template>
  <div class="app-shell">
    <!-- Top Nav -->
    <header class="app-header">
      <div class="header-left">
        <span class="brand">📊 Token Local Route</span>
        <span class="version">v1.0.0</span>
      </div>
      <div class="header-right">
        <span :class="['ws-indicator', connected ? 'ws-on' : 'ws-off']">
          {{ connected ? '● Connected' : '● Disconnected' }}
        </span>
      </div>
    </header>

    <div class="app-body">
      <!-- Sidebar -->
      <nav class="sidebar">
        <router-link to="/" class="nav-item" active-class="nav-active" exact>
          <span class="nav-icon">📊</span> Overview
        </router-link>
        <router-link to="/requests" class="nav-item" active-class="nav-active">
          <span class="nav-icon">📋</span> Requests
        </router-link>
        <router-link to="/speed" class="nav-item" active-class="nav-active">
          <span class="nav-icon">⚡</span> Speed Test
        </router-link>
      </nav>

      <!-- Main Content -->
      <main class="main-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useWebSocket } from './composables/useWebSocket';
const { connected } = useWebSocket();
</script>

<style>
/* ========================================================================
   Global Styles & CSS Variables
   ======================================================================== */
:root {
  --bg-primary: #0b1121;
  --bg-secondary: #111827;
  --bg-card: #1e293b;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --accent: #3b82f6;
  --accent-hover: #2563eb;
  --border: #334155;
  --blue: #3b82f6;
  --green: #22c55e;
  --yellow: #eab308;
  --purple: #a855f7;
  --red: #ef4444;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--bg-primary); color: var(--text-primary); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 14px; line-height: 1.5; }
a { color: inherit; text-decoration: none; }
</style>

<style scoped>
.app-shell { display: flex; flex-direction: column; min-height: 100vh; }
.app-header {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--bg-secondary); border-bottom: 1px solid var(--border);
  padding: 0 24px; height: 56px; flex-shrink: 0;
}
.brand { font-size: 16px; font-weight: 700; }
.version { font-size: 11px; color: var(--text-secondary); margin-left: 8px; background: var(--bg-card); padding: 2px 8px; border-radius: 4px; }
.ws-indicator { font-size: 12px; }
.ws-on { color: #22c55e; }
.ws-off { color: #ef4444; }

.app-body { display: flex; flex: 1; }
.sidebar {
  width: 200px; background: var(--bg-secondary); border-right: 1px solid var(--border);
  padding: 16px 0; flex-shrink: 0; display: flex; flex-direction: column; gap: 4px;
}
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 10px 20px;
  font-size: 14px; color: var(--text-secondary); transition: all 0.15s;
  border-left: 3px solid transparent; margin: 0;
}
.nav-item:hover { color: var(--text-primary); background: rgba(59,130,246,0.05); }
.nav-active {
  color: var(--text-primary); background: rgba(59,130,246,0.1);
  border-left-color: var(--accent); font-weight: 500;
}
.nav-icon { font-size: 18px; }

.main-content { flex: 1; padding: 24px; overflow-y: auto; }
</style>
