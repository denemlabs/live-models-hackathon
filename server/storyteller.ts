import {
  storytellerGreeting,
  storytellerInstructions,
  storytellerTools,
  type CallOverrides,
  type CallRequest,
} from "../shared/storyteller";

const API = "https://api.elevenlabs.io/v1";
// Bump this when the tool contract changes so a stale agent is never reused.
const AGENT_NAME = "Little Wonder storyteller v1";
const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";
const DEFAULT_LLM = "gemini-2.5-flash";

class SetupError extends Error {}

export function createStoryteller(env: NodeJS.ProcessEnv) {
  if (!env.ELEVENLABS_API_KEY) return null;
  const auth = { "xi-api-key": env.ELEVENLABS_API_KEY };
  const pinned = env.ELEVENLABS_AGENT_ID?.trim();
  const voiceId = env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE;

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        ...auth,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new SetupError(
        `${init?.method ?? "GET"} ${path} → ${response.status} ${await response.text().catch(() => "")}`.slice(
          0,
          400,
        ),
      );
    return (await response.json()) as T;
  }

  async function toolId(tool: (typeof storytellerTools)[number]) {
    const found = await call<{
      tools: { id: string; tool_config: { name: string; type: string } }[];
    }>(`/convai/tools?search=${encodeURIComponent(tool.name)}&page_size=100`);
    const existing = found.tools.find(
      (t) =>
        t.tool_config.name === tool.name && t.tool_config.type === "client",
    );
    // Agents reference tools by id, so a tool created by an older build keeps
    // its old behaviour forever unless it is brought back in step here.
    if (existing) {
      await call(`/convai/tools/${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ tool_config: tool }),
      });
      return existing.id;
    }
    const created = await call<{ id?: string; tool_id?: string }>(
      "/convai/tools",
      { method: "POST", body: JSON.stringify({ tool_config: tool }) },
    );
    const id = created.id ?? created.tool_id;
    if (!id) throw new SetupError("Tool creation returned no id.");
    return id;
  }

  async function syncTools() {
    const ids = [];
    for (const tool of storytellerTools) ids.push(await toolId(tool));
    return ids;
  }

  async function provision() {
    const found = await call<{ agents: { agent_id: string; name: string }[] }>(
      `/convai/agents?search=${encodeURIComponent(AGENT_NAME)}&page_size=100`,
    );
    const existing = found.agents.find((a) => a.name === AGENT_NAME);
    if (existing) {
      await syncTools();
      return existing.agent_id;
    }
    const toolIds = await syncTools();
    const created = await call<{ agent_id: string }>("/convai/agents/create", {
      method: "POST",
      body: JSON.stringify({
        name: AGENT_NAME,
        tags: ["little-wonder"],
        conversation_config: {
          agent: {
            first_message: "Hello there. Shall we begin a story?",
            language: "en",
            prompt: {
              prompt:
                "You are a gentle fairy-tale storyteller for one child. Wait for the session instructions.",
              llm: env.ELEVENLABS_LLM?.trim() || DEFAULT_LLM,
              temperature: 0.7,
              tool_ids: toolIds,
            },
          },
          tts: { voice_id: voiceId, speed: 0.95, stability: 0.55 },
          // Children think mid-sentence. Let the pauses breathe.
          turn: { turn_timeout: 12, turn_eagerness: "patient" },
          conversation: { max_duration_seconds: 900 },
        },
        platform_settings: {
          overrides: {
            conversation_config_override: {
              agent: {
                first_message: true,
                language: true,
                prompt: { prompt: true },
              },
              tts: { voice_id: true },
            },
          },
        },
      }),
    });
    console.log(
      `Little Wonder created an ElevenLabs storyteller agent: ${created.agent_id}\n` +
        `Pin it with ELEVENLABS_AGENT_ID=${created.agent_id} to reuse it across deploys.`,
    );
    return created.agent_id;
  }

  // An agent only accepts a per-call prompt if its owner enabled that field.
  // Ask, rather than assuming, so pinning an agent we provisioned ourselves
  // does not silently drop the storyteller back to its placeholder prompt.
  async function inspect(id: string) {
    const agent = await call<{
      name?: string;
      platform_settings?: {
        overrides?: {
          conversation_config_override?: { agent?: { prompt?: unknown } };
        };
      };
    }>(`/convai/agents/${encodeURIComponent(id)}`);
    const fields = agent.platform_settings?.overrides
      ?.conversation_config_override?.agent?.prompt as
      { prompt?: boolean } | undefined;
    // Only an agent of ours gets its tools rewritten; someone else's agent is
    // left exactly as its owner configured it.
    if (agent.name === AGENT_NAME) await syncTools();
    return { id, overridable: fields?.prompt === true };
  }

  let agent: Promise<{ id: string; overridable: boolean }> | null = null;
  function resolveAgent() {
    // Cache the in-flight promise so concurrent calls never provision twice,
    // but drop it on failure so a transient error is retried.
    if (!agent)
      agent = (
        pinned
          ? inspect(pinned)
          : provision().then((id) => ({ id, overridable: true }))
      ).catch((error: unknown) => {
        agent = null;
        throw error;
      });
    return agent;
  }

  return {
    async session(request: CallRequest) {
      const { id, overridable } = await resolveAgent();
      const { token } = await call<{ token: string }>(
        `/convai/conversation/token?agent_id=${encodeURIComponent(id)}`,
      );
      const overrides: CallOverrides | null = overridable
        ? {
            agent: {
              prompt: { prompt: storytellerInstructions(request) },
              firstMessage: storytellerGreeting(request),
              language: "en",
            },
            tts: { voiceId },
          }
        : null;
      return { token, overrides };
    },
  };
}
