import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkedCommand,
  modelMessage,
  startOrbisRun,
  type OrbisTransport,
} from "../src/orbisProtocol";

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
