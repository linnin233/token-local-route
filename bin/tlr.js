#!/usr/bin/env node
/**
 * tlr — Token Local Route CLI
 * 启动代理 (:12370) + Dashboard (:5173)
 *
 * tlr           默认全部启动
 * tlr server    仅后端
 * tlr dashboard 仅前端
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const mode = args[0] || 'all';
const onlyServer = mode === 'server';
const onlyDashboard = mode === 'dashboard';

const children = [];

function run(name, cwd, cmd, cargs) {
  console.log(`[tlr] Starting ${name}...`);
  const child = spawn(cmd, cargs, { cwd, stdio: 'inherit', shell: true, env: { ...process.env } });
  children.push(child);
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) console.log(`[tlr] ${name} exited (${code})`);
  });
}

if (!onlyDashboard) {
  const serverDir = path.join(root, 'packages', 'server');
  if (!fs.existsSync(path.join(serverDir, 'src', 'index.ts'))) {
    console.error('[tlr] Error: server not found');
    process.exit(1);
  }
  run('proxy', serverDir, 'npx', ['--yes', 'tsx', 'src/index.ts']);
}

if (!onlyServer) {
  const dashDir = path.join(root, 'packages', 'dashboard');
  if (fs.existsSync(path.join(dashDir, 'node_modules', '.vite'))) {
    run('dashboard', dashDir, 'npx', ['vite', '--port', '5173']);
  } else {
    console.log('[tlr] Dashboard deps not found, skipping (run pnpm install)');
  }
}

function cleanup() {
  children.forEach(c => { try { c.kill('SIGINT'); } catch {} });
  process.exit(0);
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
