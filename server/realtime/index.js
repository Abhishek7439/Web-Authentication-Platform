import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/index.js';

let io;

/**
 * Initialize Socket.IO on the HTTP server.
 * Rooms: `user:{userId}` — for targeted per-user notifications
 *        `approvals`      — for global approval feed
 */
export function initializeRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Allow long-polling as fallback
    transports: ['websocket', 'polling'],
  });

  // ── Auth middleware ───────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
      || socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication required.'));
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'commander-dev-secret');
      socket.userId = payload.sub;
      socket.userRole = payload.role;
      socket.userEmail = payload.email;
      next();
    } catch {
      next(new Error('Invalid token.'));
    }
  });

  // ── Connection handler ────────────────────────────
  io.on('connection', (socket) => {
    console.log(`[realtime] ${socket.userEmail} connected (${socket.id})`);

    // Join personal room
    socket.join(`user:${socket.userId}`);

    // Join global approvals room (all authenticated users)
    socket.join('approvals');

    // Join admin room if applicable
    if (socket.userRole === 'admin') {
      socket.join('admin');
    }

    // Client can request pending count on connect
    socket.on('request:pending-count', () => {
      const db = getDb();
      const count = db.prepare(`
        SELECT COUNT(*) as count FROM approval_requests
        WHERE status = 'pending'
          AND requester_id != ?
          AND id NOT IN (SELECT request_id FROM approval_votes WHERE approver_id = ?)
      `).get(socket.userId, socket.userId);
      socket.emit('pending-count', { count: count.count });
    });

    socket.on('disconnect', () => {
      console.log(`[realtime] ${socket.userEmail} disconnected`);
    });
  });

  console.log('[realtime] Socket.IO initialized');
  return io;
}

/**
 * Get the Socket.IO instance (for use in other modules).
 */
export function getIo() {
  return io;
}

/**
 * Emit an approval event to all connected clients in the approvals room.
 */
export function emitApprovalEvent(event, data) {
  if (!io) return;
  io.to('approvals').emit(event, data);
}

/**
 * Emit a targeted notification to a specific user.
 */
export function emitToUser(userId, event, data) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}

/**
 * Notify all approvers that a new approval request is waiting.
 * Excludes the requester.
 */
export function notifyNewApprovalRequest(request) {
  emitApprovalEvent('approval:new', {
    id: request.id,
    actionType: request.actionType,
    policyName: request.policyName,
    requester: request.requester,
    quorumThreshold: request.quorumThreshold,
    expiresAt: request.expiresAt,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Notify all connected users of a vote and updated tally.
 */
export function notifyVoteSubmitted(requestId, voteResult) {
  emitApprovalEvent('approval:vote', {
    requestId,
    decision: voteResult.decision,
    approver: voteResult.approver,
    tally: {
      approve: voteResult.quorumResult.approveTally,
      deny: voteResult.quorumResult.denyTally,
      threshold: voteResult.quorumResult.threshold,
      remaining: voteResult.quorumResult.remainingToApprove,
    },
    status: voteResult.quorumResult.status,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Notify when a request reaches final status (approved/denied/expired).
 */
export function notifyApprovalResolved(requestId, status, actionType) {
  emitApprovalEvent('approval:resolved', {
    requestId,
    status,
    actionType,
    timestamp: new Date().toISOString(),
  });
}
