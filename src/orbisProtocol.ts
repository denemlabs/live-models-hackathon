// set_prompt replaces the active prompt; retain the complete scene and make
// the child's current visible action explicit on every update.
export function scenePrompt(scene: string, change = "") {
  return change.trim()
    ? `Current visible action: ${change.trim()}\nScene: ${scene.trim()}`
    : scene.trim();
}

// The session handshake must declare every Orbis track, even with audio disabled.
export const ORBIS_TRACKS = [
  { name: "main_video", kind: "video", direction: "recvonly" },
  { name: "main_audio", kind: "audio", direction: "recvonly" },
] as const;

// Protocol behavior verified against Visko-Platform/orbis-hackathon-starter.
// Kept independent of React so event ordering and cancellation can be tested.
export type ModelMessage = { type?: string; [key: string]: unknown };
export type OrbisTransport = {
  sendCommand: (
    command: string,
    data: Record<string, unknown>,
  ) => Promise<unknown>;
  onMessage: (listener: (message: unknown) => void) => () => void;
};

export function modelMessage(raw: unknown): ModelMessage {
  if (!raw || typeof raw !== "object") return {};
  const envelope = raw as ModelMessage;
  const data = envelope.data;
  return data && typeof data === "object" && !Array.isArray(data)
    ? { ...data, type: envelope.type }
    : envelope;
}

export async function checkedCommand(
  transport: OrbisTransport,
  command: string,
  data: Record<string, unknown>,
  expected: string,
  signal?: AbortSignal,
  timeoutMs = 30000,
) {
  signal?.throwIfAborted();
  let finish!: (message: ModelMessage | null) => void;
  const confirmed = new Promise<ModelMessage | null>((resolve) => {
    finish = resolve;
  });
  // Orbis can acknowledge a command without a payload, then broadcast its
  // resulting state. Subscribe first so an event preceding the ack is retained.
  const unsubscribe = transport.onMessage((raw) => {
    const message = modelMessage(raw);
    if (message.type === expected) finish(message);
    if (
      message.type === "command_error" &&
      (!message.command || message.command === command)
    )
      finish(message);
  });
  const timer = setTimeout(() => finish(null), timeoutMs);
  const cancel = () => finish(null);
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const raw = await Promise.race([
      transport.sendCommand(command, data),
      confirmed,
    ]);
    signal?.throwIfAborted();
    const response = raw == null ? await confirmed : modelMessage(raw);
    signal?.throwIfAborted();
    if (response?.type !== expected) {
      throw Object.assign(new Error(`Orbis did not acknowledge ${command}.`), {
        code:
          response?.type === "command_error"
            ? "MODEL_COMMAND_REJECTED"
            : "COMMAND_TIMEOUT",
        stage: command,
      });
    }
    return response;
  } finally {
    clearTimeout(timer);
    unsubscribe();
    signal?.removeEventListener("abort", cancel);
  }
}

export async function startOrbisRun(
  transport: OrbisTransport,
  prompt: string,
  signal: AbortSignal,
  timeoutMs = 15000,
) {
  signal.throwIfAborted();
  await checkedCommand(
    transport,
    "set_audio_enabled",
    { audio_enabled: false },
    "audio_enabled_accepted",
    signal,
  );
  signal.throwIfAborted();
  let finish!: (value: boolean) => void;
  const ready = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  // Subscribe before sending the prompt: conditions_ready can precede its ack.
  const unsubscribe = transport.onMessage((raw) => {
    const message = modelMessage(raw);
    if (message.type === "conditions_ready") finish(true);
    if (message.type === "command_error") finish(false);
  });
  const timer = setTimeout(() => finish(false), timeoutMs);
  const cancel = () => finish(false);
  signal.addEventListener("abort", cancel, { once: true });
  try {
    await checkedCommand(
      transport,
      "set_prompt",
      { prompt },
      "prompt_accepted",
      signal,
    );
    const isReady = await ready;
    signal.throwIfAborted();
    if (!isReady) throw new Error("Orbis did not report ready conditions.");
    await checkedCommand(transport, "start", {}, "generation_started", signal);
    signal.throwIfAborted();
  } finally {
    clearTimeout(timer);
    unsubscribe();
    signal.removeEventListener("abort", cancel);
  }
}

export function orbisFailure(cause: unknown, stage = "connection") {
  const rawCode =
    cause && typeof cause === "object"
      ? ((cause as { code?: unknown }).code ??
        ((cause as { name?: unknown }).name === "TimeoutError"
          ? "REQUEST_TIMEOUT"
          : undefined))
      : undefined;
  const code =
    typeof rawCode === "string" && /^[A-Z_]{1,50}$/.test(rawCode)
      ? rawCode
      : "SESSION_ERROR";
  if (code === "VIDEO_IN_ANOTHER_TAB")
    return {
      code,
      status: "Live video is open in another tab",
      message:
        "Choose A new story in the other Little Wonder tab to release live video, then reconnect here. This picture is an illustration; your story is still available.",
    };
  if (
    code === "REQUEST_TIMEOUT" ||
    code === "COMMAND_TIMEOUT" ||
    code === "FIRST_FRAME_TIMEOUT" ||
    code === "TimeoutError"
  )
    return {
      code,
      status: "Live video timed out",
      message: `Orbis timed out during ${stage} (${code}). Reconnect to try again. The picture shown is an illustration.`,
    };
  return code === "RATE_LIMITED"
    ? {
        code,
        status: "Video session limit reached",
        message:
          "This Reactor account allows one concurrent generation. Close unused Reactor sessions or wait for them to finish, then reconnect. Check other story tabs, localhost, and the Reactor sandbox. This picture is an illustration; your story is still available.",
      }
    : {
        code,
        status: "Video disconnected — illustration",
        message: `Live video failed during ${stage} (${code}). The picture shown is an illustration. You can keep reading or reconnect.`,
      };
}
