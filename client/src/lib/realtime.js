import { io } from 'socket.io-client';
import { getToken } from './api.js';

let socket = null;
const handlers = new Map();

/**
 * Connect to the Socket.IO server with JWT auth.
 * Idempotent — calling multiple times returns the same connection.
 */
export function connectRealtime() {
  if (socket?.connected) return socket;

  const token = getToken();
  if (!token) return null;

  socket = io(window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    console.log('[realtime] Connected:', socket.id);
    socket.emit('request:pending-count');
  });

  socket.on('connect_error', (err) => {
    console.warn('[realtime] Connection error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[realtime] Disconnected:', reason);
  });

  // Forward all events to registered handlers
  const eventTypes = ['approval:new', 'approval:vote', 'approval:resolved', 'pending-count'];
  eventTypes.forEach((event) => {
    socket.on(event, (data) => {
      const eventHandlers = handlers.get(event) || [];
      eventHandlers.forEach((fn) => fn(data));
    });
  });

  return socket;
}

/**
 * Disconnect the Socket.IO client.
 */
export function disconnectRealtime() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Register a handler for a real-time event.
 * Returns an unsubscribe function.
 */
export function onRealtimeEvent(event, handler) {
  if (!handlers.has(event)) {
    handlers.set(event, []);
  }
  handlers.get(event).push(handler);

  return () => {
    const list = handlers.get(event) || [];
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  };
}

/**
 * Show a toast notification for a real-time event.
 */
export function showToast(message, type = 'info', durationMs = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(() => toast.remove(), 320);
  }, durationMs);
}
