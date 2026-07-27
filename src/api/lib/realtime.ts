// NOTE: Close codes for WebSocket connections. Pre-upgrade failures (e.g. a
// 401 from `requireAuth`) surface in the browser as `CloseEvent.code: 1006`
// regardless and cannot be customized. The custom 4xxx codes apply only when
// the server closes the socket after the upgrade has succeeded.
export const WS_CLOSE = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  POLICY_VIOLATION: 1008,
  INTERNAL_ERROR: 1011,
  UNAUTHORIZED: 4401,
  SESSION_EXPIRED: 4402,
} as const;

export type WsCloseCode = (typeof WS_CLOSE)[keyof typeof WS_CLOSE];

// NOTE: idleTimeoutSec is below Bun's default of 120s so a half-open
// connection is detected faster. Bun sends ping frames automatically
// (`sendPings: true` is the default), so we don't need application-level
// heartbeats; the schema's `ping`/`pong` types below are purely didactic.
//
// `maxConnectionsPerUser` caps how many simultaneous WS connections one
// authenticated user can hold open at once. The HTTP rate limiter in
// `src/api/middlewares/rateLimit.ts` already throttles new upgrade
// requests per IP; this cap protects against a single authenticated user
// pinning many sockets open (file descriptors, tick intervals, memory).
export const realtimeConfig = {
  idleTimeoutSec: 60,
  maxPayloadBytes: 16 * 1024,
  tickIntervalMs: 5_000,
  maxConnectionsPerUser: 5,
};
