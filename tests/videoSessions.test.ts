import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VideoSessions } from "../server/videoSessions";

async function fixture(run: (file: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "video-sessions-"));
  try {
    await run(join(directory, "sessions.json"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
function provider() {
  let counter = 0;
  const calls: string[] = [];
  const request: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push(`${init?.method} ${path}`);
    if (path === "/tokens") {
      const body = JSON.parse(init!.body as string);
      assert.equal(
        body.authorization_details[0].constraints.max_session_duration_seconds,
        1800,
      );
      return Response.json({ jwt: "server-only-scoped-token" });
    }
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    if (path === "/sessions")
      return Response.json({ session_id: `session-${++counter}` });
    throw Error("Unexpected request");
  };
  return { request, calls };
}
const env = { REACTOR_API_KEY: "primary-test-secret" };

test("newest connection terminates its predecessor; stale release cannot terminate the replacement", async () =>
  fixture(async (file) => {
    const mock = provider();
    const manager = new VideoSessions(env, file, mock.request);
    const first = await manager.open();
    const second = await manager.open();
    assert.deepEqual(mock.calls, [
      "POST /tokens",
      "POST /sessions",
      "DELETE /sessions/session-1",
      "POST /tokens",
      "POST /sessions",
    ]);
    await manager.release(first.leaseId);
    assert.equal(await manager.heartbeat(first.leaseId), false);
    assert.equal(await manager.heartbeat(second.leaseId), true);
    assert.equal(
      mock.calls.filter((call) => call.startsWith("DELETE")).length,
      1,
    );
    await manager.release(second.leaseId);
    assert.equal(mock.calls.at(-1), "DELETE /sessions/session-2");
  }));

test("persistent tracking survives a server restart and abandoned sessions are reaped", async () =>
  fixture(async (file) => {
    const mock = provider();
    let now = 1000;
    const firstProcess = new VideoSessions(env, file, mock.request, () => now);
    await firstProcess.open();
    const restarted = new VideoSessions(env, file, mock.request, () => now);
    const next = await restarted.open();
    assert.ok(mock.calls.includes("DELETE /sessions/session-1"));
    now += 121000;
    await restarted.reap();
    assert.equal(mock.calls.at(-1), "DELETE /sessions/session-2");
    assert.equal(await restarted.heartbeat(next.leaseId), false);
  }));

test("concurrent connection requests are serialized and cleanup failure blocks overlap", async () =>
  fixture(async (file) => {
    const mock = provider();
    const manager = new VideoSessions(env, file, mock.request);
    const [first, second] = await Promise.all([manager.open(), manager.open()]);
    assert.equal(await manager.heartbeat(first.leaseId), false);
    assert.equal(await manager.heartbeat(second.leaseId), true);
    const failing = new VideoSessions(env, file, async (input, init) =>
      init?.method === "DELETE"
        ? new Response(null, { status: 500 })
        : mock.request(input, init),
    );
    const before = mock.calls.length;
    await assert.rejects(failing.open(), /previous video is still closing/);
    assert.equal(mock.calls.length, before);
  }));

test("an occupied untracked primary falls back to the separate backup account", async () =>
  fixture(async (file) => {
    const calls: string[] = [];
    const request: typeof fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      const h = init!.headers as Record<string, string>;
      if (path === "/tokens")
        return Response.json({
          jwt:
            h["Reactor-API-Key"] === "primary-test-secret"
              ? "primary-jwt"
              : "backup-jwt",
        });
      calls.push(h.Authorization);
      if (h.Authorization === "Bearer primary-jwt")
        return new Response(null, {
          status: 429,
          headers: { "retry-after": "0.001" },
        });
      return Response.json({ session_id: "backup-session" });
    };
    const manager = new VideoSessions(
      { ...env, REACTOR_API_KEY_BACKUP: "backup-test-secret" },
      file,
      request,
    );
    const result = await manager.open();
    assert.equal(result.provider, "backup");
    assert.deepEqual(calls, [
      "Bearer primary-jwt",
      "Bearer primary-jwt",
      "Bearer primary-jwt",
      "Bearer backup-jwt",
    ]);
  }));
