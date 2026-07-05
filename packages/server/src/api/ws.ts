/**
 * WebSocket 服务器
 *
 * 基于 ws 库，附加到 HTTP Server 上。
 * 提供 broadcast 函数用于向所有连接的 Dashboard 客户端推送实时数据。
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';

// ============================================================================
// 接口定义
// ============================================================================

export interface WSServerInstance {
  wss: WebSocketServer;
  /** 向所有已连接的客户端广播一条 JSON 消息 */
  broadcast: (data: unknown) => void;
}

// ============================================================================
// 创建 WebSocket 服务器
// ============================================================================

/**
 * 创建 WebSocket 服务器并附加到现有的 HTTP server。
 *
 * WebSocket 路径：/ws
 *
 * @param httpServer  已启动或待启动的 Node.js HTTP server
 * @returns 包含 wss 实例和 broadcast 函数的对象
 */
export function createWSServer(httpServer: Server): WSServerInstance {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
  });

  // 连接管理
  wss.on('connection', (ws: WebSocket) => {
    console.log('[ws] Client connected');

    // 发送欢迎消息
    ws.send(JSON.stringify({
      type: 'connected',
      timestamp: Date.now(),
      message: 'Connected to token-local-route',
    }));

    // Keepalive: 每 30 秒 ping 一次
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30_000);

    // 客户端关闭时的清理
    ws.on('close', () => {
      clearInterval(pingInterval);
      console.log('[ws] Client disconnected');
    });

    // 错误处理
    ws.on('error', (err: Error) => {
      console.error('[ws] Client error:', err.message);
      clearInterval(pingInterval);
    });
  });

  wss.on('error', (err: Error) => {
    console.error('[ws] Server error:', err.message);
  });

  /**
   * 向所有已连接的客户端广播消息。
   *
   * JSON 序列化只执行一次，所有客户端共享同一份字符串数据。
   *
   * @param data  要广播的数据（会被 JSON.stringify）
   */
  function broadcast(data: unknown): void {
    const message = JSON.stringify(data);

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  return { wss, broadcast };
}
