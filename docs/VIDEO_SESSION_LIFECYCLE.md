# Video session ownership

The Railway server creates Orbis sessions using the Reactor coordinator API (version 1). Browsers adopt the returned session ID instead of creating sessions themselves. The server owns deletion through `DELETE /sessions/{session_id}` using the same scoped token.

A new `/api/reactor/session` request closes the previous tracked session before creating its replacement. Requests are serialized within the single service instance. A random lease ID identifies each client; a delayed heartbeat or release from an older client cannot terminate the current client’s session. The latest connection takes priority, including across browsers and devices.

The session ID and scoped cleanup token are persisted with restricted file permissions at `/data/video-session.json` on the Railway volume. No story text, audio, or child profile is stored there. Use one Railway replica: this file and in-process queue are not a distributed lock for multiple replicas.

Browsers heartbeat every 20 seconds and send a keepalive release when leaving. The server reaps sessions without a heartbeat for two minutes. Reactor also enforces a 30-minute maximum session lifetime; scoped tokens last 40 minutes so cleanup remains authorized throughout that lifetime. Older clients using `/api/reactor/token` receive an eight-minute cap beneath their ten-minute token expiry.

The server first tries the last working account, including the provider recovered from a persisted active session. A newly probed occupied account falls back immediately to the other configured account. A just-closed account gets bounded retries while Reactor releases its quota. It never repeatedly alternates accounts. Sessions created by older clients before this registry existed cannot be deleted by ID unless that ID is recovered or Reactor clears them once.

Narration can be prepared during handover, but neither ElevenLabs page audio nor browser speech plays until the video element reports its first presented frame. A connection acknowledgement or generation-start event is insufficient. Cancelled, failed, or superseded video startup cancels the waiting narration. Live story calls prepare a living scene before starting the voice connection. Browser WebRTC detachment runs in the background; the backend's confirmed session release remains the authority for opening the replacement.

Official protocol source: https://github.com/reactor-team/reactor-client-sdks/blob/main/crates/reactor-core/src/coordinator.rs
