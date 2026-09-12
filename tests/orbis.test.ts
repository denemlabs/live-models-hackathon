import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkedCommand,
  scenePrompt,
  ORBIS_TRACKS,
  orbisFailure,
  modelMessage,
  startOrbisRun,
  type OrbisTransport,
} from "../src/orbisProtocol";

test("live prompt replacement retains the scene and explicitly sends the new action", async () => {
  const scene =
    "A little green frog above a pond, watercolor style, gentle camera.";
  const action = "The green frog flies through the air above the water.";
  let sent: Record<string, unknown> | undefined;
  const transport: OrbisTransport = {
    onMessage: () => () => {},
    sendCommand: async (command, data) => {
      assert.equal(command, "set_prompt");
      sent = data;
      return { type: "prompt_accepted" };
    },
  };
  await checkedCommand(
    transport,
    "set_prompt",
    { prompt: scenePrompt(scene, action) },
    "prompt_accepted",
  );
  assert.ok(String(sent?.prompt).includes(scene));
  assert.ok(String(sent?.prompt).includes(action));
  assert.equal(scenePrompt(scene), scene);
});

function fakeTransport(
  handler: (
    command: string,
    emit: (message: unknown) => void,
  ) => unknown | Promise<unknown>,
) {
  const listeners = new Set<(message: unknown) => void>();
  const calls: string[] = [];
  const emit = (message: unknown) =>
    listeners.forEach((listener) => listener(message));
  const transport: OrbisTransport = {
    onMessage: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    sendCommand: async (command) => {
      calls.push(command);
      return handler(command, emit);
    },
  };
  return { transport, calls, listeners, emit };
}
const reply = (command: string) => ({
  type: (
    {
      set_audio_enabled: "audio_enabled_accepted",
      set_prompt: "prompt_accepted",
      start: "generation_started",
    } as Record<string, string>
  )[command],
});

test("Orbis readiness arriving before the prompt ack is retained", async () => {
  const fake = fakeTransport((command, emit) => {
    if (command === "set_prompt") emit({ type: "conditions_ready", data: {} });
    return reply(command);
  });
  await startOrbisRun(
    fake.transport,
    "A fox in a gentle forest",
    new AbortController().signal,
  );
  assert.deepEqual(fake.calls, ["set_audio_enabled", "set_prompt", "start"]);
  assert.equal(fake.listeners.size, 0);
});

test("Orbis does not start until conditions_ready arrives after the ack", async () => {
  const fake = fakeTransport((command) => reply(command));
  const running = startOrbisRun(
    fake.transport,
    "A moon rabbit",
    new AbortController().signal,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(fake.calls, ["set_audio_enabled", "set_prompt"]);
  fake.emit({ type: "conditions_ready" });
  await running;
  assert.equal(fake.calls.at(-1), "start");
});

test("a rejected command reply cannot start a generation and cleans up the listener", async () => {
  const fake = fakeTransport((command) =>
    command === "set_prompt"
      ? { type: "command_error", data: { reason: "private upstream details" } }
      : reply(command),
  );
  await assert.rejects(
    startOrbisRun(fake.transport, "A fox", new AbortController().signal),
    /did not acknowledge set_prompt/,
  );
  assert.ok(!fake.calls.includes("start"));
  assert.equal(fake.listeners.size, 0);
  await assert.rejects(
    checkedCommand(
      { ...fake.transport, sendCommand: async () => undefined },
      "pause",
      {},
      "generation_paused",
      undefined,
      5,
    ),
  );
});

test("missing readiness times out and cancelling a story prevents late starts", async () => {
  const fake = fakeTransport((command) => reply(command));
  await assert.rejects(
    startOrbisRun(fake.transport, "A fox", new AbortController().signal, 5),
    /ready conditions/,
  );
  assert.equal(fake.listeners.size, 0);
  const abort = new AbortController();
  const running = startOrbisRun(fake.transport, "A fox", abort.signal);
  const rejection = assert.rejects(running, { name: "AbortError" });
  await new Promise((resolve) => setImmediate(resolve));
  abort.abort();
  fake.emit({ type: "conditions_ready" });
  await rejection;
  assert.ok(!fake.calls.includes("start"));
  assert.equal(fake.listeners.size, 0);
});

test("model state handles both envelope and direct payload forms", () => {
  assert.deepEqual(modelMessage({ type: "state", data: { started: false } }), {
    type: "state",
    started: false,
  });
  assert.deepEqual(modelMessage({ type: "generation_complete" }), {
    type: "generation_complete",
  });
  assert.deepEqual(modelMessage(null), {});
});

test("Orbis handshake includes both required receiving tracks even when generation audio is disabled", () => {
  assert.deepEqual(ORBIS_TRACKS, [
    { name: "main_video", kind: "video", direction: "recvonly" },
    { name: "main_audio", kind: "audio", direction: "recvonly" },
  ]);
});

test("empty acknowledgments wait for early or late model confirmation", async () => {
  for (const early of [true, false]) {
    const fake = fakeTransport((_command, emit) => {
      if (early) emit({ type: "generation_started", data: {} });
      else setTimeout(() => emit({ type: "generation_started", data: {} }), 5);
      return undefined;
    });
    const response = await checkedCommand(
      fake.transport,
      "start",
      {},
      "generation_started",
      undefined,
      100,
    );
    assert.equal(response.type, "generation_started");
    assert.equal(fake.listeners.size, 0);
  }
});

test("empty acknowledgments cannot report success without confirmation or after cancellation", async () => {
  const fake = fakeTransport(() => undefined);
  await assert.rejects(
    checkedCommand(
      fake.transport,
      "start",
      {},
      "generation_started",
      undefined,
      5,
    ),
    /did not acknowledge start/,
  );
  const abort = new AbortController();
  const running = checkedCommand(
    fake.transport,
    "start",
    {},
    "generation_started",
    abort.signal,
  );
  const rejection = assert.rejects(running, { name: "AbortError" });
  abort.abort();
  fake.emit({ type: "generation_started" });
  await rejection;
  assert.equal(fake.listeners.size, 0);
});

test("account session limits are actionable and never expose provider error bodies", () => {
  const failure = orbisFailure({
    code: "RATE_LIMITED",
    message: "private token and prompt details",
  });
  assert.equal(failure.status, "Video session limit reached");
  assert.match(failure.message, /Close unused Reactor sessions or wait/);
  assert.match(failure.message, /illustration/);
  assert.ok(!JSON.stringify(failure).includes("private token"));
  assert.equal(orbisFailure({ code: "private token" }).code, "SESSION_ERROR");
});

test("hung SDK commands are bounded by our deadline and unsubscribe", async () => {
  const fake = fakeTransport(() => new Promise(() => {}));
  await assert.rejects(
    checkedCommand(
      fake.transport,
      "start",
      {},
      "generation_started",
      undefined,
      10,
    ),
    { code: "COMMAND_TIMEOUT" },
  );
  assert.equal(fake.listeners.size, 0);
});

test("cancelling a hung SDK command does not wait for the SDK", async () => {
  const fake = fakeTransport(() => new Promise(() => {}));
  const abort = new AbortController();
  const running = checkedCommand(
    fake.transport,
    "start",
    {},
    "generation_started",
    abort.signal,
  );
  const rejected = assert.rejects(running, { name: "AbortError" });
  abort.abort();
  await rejected;
  assert.equal(fake.listeners.size, 0);
});

test("timeouts expose the failing stage and code without raw upstream details", () => {
  for (const cause of [
    { code: "REQUEST_TIMEOUT", message: "private token" },
    { name: "TimeoutError" },
  ]) {
    const failure = orbisFailure(cause, "Orbis startup / WebRTC");
    assert.match(failure.message, /Orbis startup \/ WebRTC/);
    assert.match(failure.message, /REQUEST_TIMEOUT/);
    assert.ok(!failure.message.includes("private token"));
  }
});
