import { ref, onMounted, onUnmounted } from 'vue';
import type { WSMessage, RequestRecord } from '../types';

/**
 * Vue 3 composable for WebSocket connection to the Go backend.
 *
 * Connects to the Vite proxy at /ws. Listens for `new_request` and
 * `speed_test` messages and exposes reactive refs for live updates.
 * Automatically reconnects after a 3-second delay on close.
 */
export function useWebSocket() {
  /** Whether the backend has confirmed the WebSocket connection. */
  const connected = ref(false);

  /** The most recent `new_request` payload. */
  const lastRequest = ref<RequestRecord | null>(null);

  /** The most recent `speed_test` payload. */
  const lastSpeedTest = ref<any>(null);

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // ---------- helpers ----------

  /** Schedules a reconnection attempt 3 seconds from now (no-op if one is already pending). */
  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      // Only reconnect if the socket is still closed (avoids racing a manual reconnect).
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        connect();
      }
    }, 3000);
  }

  /** Parse incoming message and update the appropriate reactive ref. */
  function handleMessage(event: MessageEvent) {
    try {
      const msg: WSMessage = JSON.parse(event.data);

      switch (msg.type) {
        case 'connected':
          connected.value = true;
          break;
        case 'new_request':
          if (msg.data) {
            lastRequest.value = msg.data as RequestRecord;
          }
          break;
        case 'speed_test':
          lastSpeedTest.value = msg.data;
          break;
      }
    } catch {
      // Malformed JSON — silently ignore.
    }
  }

  /** Mark disconnected and kick off auto-reconnect. */
  function handleClose() {
    connected.value = false;
    scheduleReconnect();
  }

  // ---------- public API ----------

  /** Open a WebSocket connection to the Vite proxy endpoint /ws. */
  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws`;

    ws = new WebSocket(url);
    ws.onmessage = handleMessage;
    ws.onclose = handleClose;
    // onerror fires first, then onclose — reconnect is handled in onclose.
    ws.onerror = () => {};
  }

  /** Tear down the connection and cancel any pending reconnect. */
  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      // Suppress auto-reconnect for intentional disconnects.
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    connected.value = false;
  }

  // ---------- lifecycle ----------

  onMounted(() => connect());
  onUnmounted(() => disconnect());

  return { connected, lastRequest, lastSpeedTest };
}
