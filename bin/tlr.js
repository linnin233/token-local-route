#!/usr/bin/env node
/**
 * tlr — Token Local Route CLI
 * 启动本地 LLM API 代理 (:12370)
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..', 'packages', 'server');
const indexFile = path.join(serverDir, 'src', 'index.ts');

if (!fs.existsSync(indexFile)) {
  console.error('[tlr] Error: server not found at', indexFile);
  process.exit(1);
}

console.log('[tlr] Starting Token Local Route...\n');

const child = spawn('npx', ['--yes', 'tsx', indexFile], {
  cwd: serverDir,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env },
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
