# Video session ownership

The Railway server creates Orbis sessions using the Reactor coordinator API (version 1). Browsers adopt the returned session ID instead of creating sessions themselves. The server owns deletion through `DELETE /sessions/{session_id}` using the same scoped token.

A new `/api/reactor/session` request closes the previous tracked session before creating its replacement. Requests are serialized within the single service instance. A random lease ID identifies each client; a delayed heartbeat or release from an older client cannot terminate the current client’s session. The latest connection takes priority, including across browsers and devices.

The session ID and scoped cleanup token are persisted with restricted file permissions at `/data/video-session.json` on the Railway volume. No story text, audio, or child profile is stored there. Use one Railway replica: this file and in-process queue are not a distributed lock for multiple replicas.

Browsers heartbeat every 20 seconds and send a keepalive release when leaving. The server reaps sessions without a heartbeat for two minutes. Reactor also enforces a 30-minute maximum session lifetime; scoped tokens last 40 minutes so cleanup remains authorized throughout that lifetime. Older clients using `/api/reactor/token` receive an eight-minute cap beneath their ten-minute token expiry.

If the primary account remains rate limited after bounded retries, the server uses the separately provisioned backup account. It never repeatedly alternates accounts. Sessions created by older clients before this registry existed cannot be deleted by ID unless that ID is recovered or Reactor clears them once.

Official protocol source: https://github.com/reactor-team/reactor-client-sdks/blob/main/crates/reactor-core/src/coordinator.rs
