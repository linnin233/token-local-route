<template>
  <div class="app-layout">
    <!-- ========== 顶部 Header ========== -->
    <header class="app-header">
      <div class="header-left">
        <span class="app-title">Token Local Route</span>
      </div>
      <div class="header-right">
        <span class="ws-status" :class="{ connected: ws.connected }">
          <span class="ws-dot"></span>
          {{ ws.connected ? 'Connected' : 'Disconnected' }}
        </span>
      </div>
    </header>

    <!-- ========== 主体：侧边栏 + 内容区 ========== -->
    <div class="app-body">
      <!-- 侧边栏导航 -->
      <nav class="app-sidebar">
        <router-link to="/" class="nav-item" exact-active-class="nav-active">
          <span class="nav-icon">📊</span>
          <span class="nav-label">Overview</span>
        </router-link>
        <router-link to="/requests" class="nav-item" active-class="nav-active">
          <span class="nav-icon">📋</span>
          <span class="nav-label">Requests</span>
        </router-link>
        <router-link to="/speed" class="nav-item" active-class="nav-active">
          <span class="nav-icon">⚡</span>
          <span class="nav-label">Speed Test</span>
        </router-link>
      </nav>

      <!-- 主内容 -->
      <main class="app-main">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Root Vue component for the Token Local Route dashboard.
 *
 * Provides the overall app chrome:
 * - Header bar with project name & WebSocket connection indicator
 * - Left sidebar navigation (Overview / Requests / Speed Test)
 * - Main content area with <router-view>
 *
 * Uses useWebSocket() composable for live connection status.
 */
import { useWebSocket } from './composables/useWebSocket';

// connect() 在 composable 内部 onMounted 时自动调用
const ws = useWebSocket();
</script>

<style scoped>
/* ===================== CSS Custom Properties (Dark Theme) ===================== */
:root {
  --bg-primary: #0f172a;
  --bg-secondary: #1e293b;
  --bg-card: #1e293b;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --accent: #3b82f6;
  --accent-hover: #2563eb;
  --border: #334155;
  --success: #22c55e;
  --warning: #eab308;
  --danger: #ef4444;

  --sidebar-width: 200px;
  --header-height: 52px;
}

/* ===================== Global Reset / Base ===================== */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* ===================== Layout ===================== */
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
}

/* ===================== Header ===================== */
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-height);
  padding: 0 24px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  user-select: none;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: var(--text-primary);
}

/* ---------- WebSocket 状态指示 ---------- */
.header-right {
  display: flex;
  align-items: center;
}

.ws-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  transition: color 0.2s;
}

.ws-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
  transition: background 0.25s;
}

.ws-status.connected .ws-dot {
  background: var(--success);
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
}

.ws-status.connected {
  color: var(--success);
}

/* ===================== Body: Sidebar + Content ===================== */
.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ---------- Sidebar ---------- */
.app-sidebar {
  width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 12px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  flex-shrink: 0;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
  cursor: pointer;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.nav-icon {
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
}

.nav-label {
  line-height: 1;
}

/* Active route — 蓝色高亮 */
.nav-active {
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
  font-weight: 600;
}

.nav-active .nav-icon {
  filter: none;
}

/* ---------- Main Content ---------- */
.app-main {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: var(--bg-primary);
}
</style>
