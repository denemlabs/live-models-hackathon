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
) {
  const response = modelMessage(await transport.sendCommand(command, data));
  if (response.type !== expected) {
    // Never expose raw provider replies or prompts to the child-facing UI.
    throw new Error(`Orbis did not acknowledge ${command}.`);
  }
  return response;
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
    );
    const isReady = await ready;
    signal.throwIfAborted();
    if (!isReady) throw new Error("Orbis did not report ready conditions.");
    await checkedCommand(transport, "start", {}, "generation_started");
    signal.throwIfAborted();
  } finally {
    clearTimeout(timer);
    unsubscribe();
    signal.removeEventListener("abort", cancel);
  }
}
