import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app";
import { ProfileSchema } from "../shared/story";
import {
  PageArgsSchema,
  pageChoices,
  SceneArgsSchema,
  SHOW_SCENE_TOOL,
  storytellerGreeting,
  storytellerInstructions,
  storytellerTools,
  TURN_PAGE_TOOL,
} from "../shared/storyteller";

const profile = ProfileSchema.parse({});
const KEY = "test-elevenlabs-secret";
const AGENT_NAME = "Little Wonder storyteller v1";

test("voice pages support open-ended questions without blank choice buttons", () => {
  const args = PageArgsSchema.parse({
    title: "A little wonder",
    question: "What would you invent?",
    choice_one: "",
    choice_two: "  ",
  });
  assert.deepEqual(pageChoices(args), []);
  assert.deepEqual(
    pageChoices({
      ...args,
      choice_one: " A bubble boat ",
      choice_two: "A leaf raft",
    }),
    ["A bubble boat", "A leaf raft"],
  );
  const prompt = storytellerInstructions({
    profile,
    topic: "A fox",
    history: [],
  });
  assert.match(prompt, /BOTH choice_one and choice_two as empty strings/);
  assert.match(prompt, /Always wait for the child/);
});

async function withServer(
  env: NodeJS.ProcessEnv,
  run: (base: string) => Promise<void>,
) {
  const server = createApp(env).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
const post = (url: string, data: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

type Recorded = { url: string; method: string; body: any; key?: string };

// Stands in for the ElevenLabs workspace: an empty one unless seeded with an
// agent. `pinnedAllowsOverrides` models whether a pinned agent's owner enabled
// the prompt override field.
function mockElevenLabs(
  options: {
    existingAgent?: string;
    pinnedAllowsOverrides?: boolean;
    pinnedName?: string;
    existingTools?: boolean;
  } = {},
) {
  const original = globalThis.fetch;
  const log = console.log;
  const calls: Recorded[] = [];
  let agents = options.existingAgent
    ? [
        {
          agent_id: options.existingAgent,
          name: AGENT_NAME,
        },
      ]
    : [];
  console.log = () => {};
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith("https://api.elevenlabs.io"))
      return original(input, init);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body as string) : undefined,
      key: (init?.headers as Record<string, string>)["xi-api-key"],
    });
    const json = (data: unknown) =>
      new Response(JSON.stringify(data), { status: 200 });
    if (url.includes("/convai/tools?")) {
      const name = new URL(url).searchParams.get("search");
      return json({
        tools: options.existingTools
          ? [{ id: `tool_${name}`, tool_config: { name, type: "client" } }]
          : [],
      });
    }
    if (/\/convai\/tools\/[^/?]+$/.test(url)) return json({ id: "tool_test" });
    if (url.endsWith("/convai/tools")) return json({ id: "tool_test" });
    if (url.includes("/convai/agents?")) return json({ agents });
    if (/\/convai\/agents\/[^/?]+$/.test(url))
      return json({
        name: options.pinnedName,
        platform_settings: {
          overrides: {
            conversation_config_override: {
              agent: { prompt: { prompt: !!options.pinnedAllowsOverrides } },
            },
          },
        },
      });
    if (url.endsWith("/convai/agents/create")) {
      agents = [{ agent_id: "agent_new", name: AGENT_NAME }];
      return json({ agent_id: "agent_new" });
    }
    if (url.includes("/convai/conversation/token"))
      return json({ token: "test-conversation-token" });
    return new Response("unexpected", { status: 404 });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
      console.log = log;
    },
  };
}

test("a story call provisions one storyteller agent, reuses it, and never leaks the key", async () => {
  const eleven = mockElevenLabs();
  try {
    await withServer({ ELEVENLABS_API_KEY: KEY }, async (base) => {
      const first = await post(`${base}/api/storyteller/token`, { profile });
      const data = await first.json();
      assert.equal(first.status, 200);
      assert.equal(data.token, "test-conversation-token");
      assert.ok(!JSON.stringify(data).includes(KEY));
      assert.ok(eleven.calls.every((call) => call.key === KEY));

      const second = await post(`${base}/api/storyteller/token`, { profile });
      assert.equal(second.status, 200);
    });
    const created = eleven.calls.filter((call) =>
      call.url.endsWith("/convai/agents/create"),
    );
    assert.equal(created.length, 1, "the agent is provisioned exactly once");
    const config = created[0].body.conversation_config;
    assert.deepEqual(config.agent.prompt.tool_ids, ["tool_test", "tool_test"]);
    assert.equal(config.turn.turn_eagerness, "patient");
    assert.equal(
      created[0].body.platform_settings.overrides.conversation_config_override
        .agent.prompt.prompt,
      true,
      "the session prompt must be overridable for the profile to matter",
    );
  } finally {
    eleven.restore();
  }
});

test("an existing agent is reused instead of creating a second one", async () => {
  const eleven = mockElevenLabs({ existingAgent: "agent_already_there" });
  try {
    await withServer({ ELEVENLABS_API_KEY: KEY }, async (base) => {
      assert.equal(
        (await post(`${base}/api/storyteller/token`, { profile })).status,
        200,
      );
    });
    assert.equal(
      eleven.calls.filter((c) => c.url.endsWith("/convai/agents/create"))
        .length,
      0,
    );
    assert.ok(
      eleven.calls.some((c) =>
        c.url.includes("conversation/token?agent_id=agent_already_there"),
      ),
    );
  } finally {
    eleven.restore();
  }
});

test("a pinned agent skips provisioning", async () => {
  const eleven = mockElevenLabs({ pinnedAllowsOverrides: true });
  try {
    await withServer(
      { ELEVENLABS_API_KEY: KEY, ELEVENLABS_AGENT_ID: "agent_pinned" },
      async (base) => {
        assert.equal(
          (await post(`${base}/api/storyteller/token`, { profile })).status,
          200,
        );
      },
    );
    assert.ok(
      eleven.calls.every((c) => c.method === "GET"),
      "a pinned agent must not create tools or agents",
    );
  } finally {
    eleven.restore();
  }
});

// Pinning the agent we provisioned is the documented happy path, so it has to
// keep receiving the per-call prompt that carries the safety rules.
test("the per-call prompt follows what the pinned agent actually allows", async () => {
  for (const allowed of [true, false]) {
    const eleven = mockElevenLabs({ pinnedAllowsOverrides: allowed });
    try {
      await withServer(
        { ELEVENLABS_API_KEY: KEY, ELEVENLABS_AGENT_ID: "agent_pinned" },
        async (base) => {
          const { overrides } = await (
            await post(`${base}/api/storyteller/token`, { profile })
          ).json();
          if (allowed)
            assert.match(
              overrides.agent.prompt.prompt,
              /KEEPING THIS CHILD SAFE/,
            );
          else assert.equal(overrides, null);
        },
      );
    } finally {
      eleven.restore();
    }
  }
});

test("the session prompt carries the child's profile, the story so far, and the safety rules", async () => {
  const eleven = mockElevenLabs();
  try {
    await withServer({ ELEVENLABS_API_KEY: KEY }, async (base) => {
      const response = await post(`${base}/api/storyteller/token`, {
        profile: { ...profile, age: "3–5", reducedMotion: true },
        topic: "a little fox",
        history: [
          {
            title: "The Little Lantern Keeper",
            narrative: "Pip found a lantern.",
            question: "Where next?",
            choices: ["Left", "Right"],
            visualPrompt: "a mossy forest",
            theme: "forest",
          },
        ],
      });
      const { overrides } = await response.json();
      const prompt = overrides.agent.prompt.prompt;
      assert.match(prompt, /aged 3–5/);
      assert.match(prompt, /very short sentences/);
      assert.match(prompt, /The Little Lantern Keeper/);
      assert.match(prompt, /a little fox/);
      assert.match(prompt, /never guess a child's age/i);
      assert.match(prompt, /Keep every scene still and calm/);
      assert.match(overrides.agent.firstMessage, /keep going/i);
    });
  } finally {
    eleven.restore();
  }
});

test("story calls need a key and a valid profile", async () => {
  await withServer({}, async (base) => {
    const response = await post(`${base}/api/storyteller/token`, { profile });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /ElevenLabs/);
    assert.equal(
      (await fetch(`${base}/api/config`).then((r) => r.json())).storyteller,
      false,
    );
  });
  const eleven = mockElevenLabs();
  try {
    await withServer({ ELEVENLABS_API_KEY: KEY }, async (base) => {
      assert.equal(
        (
          await post(`${base}/api/storyteller/token`, {
            profile: { age: "45" },
          })
        ).status,
        400,
      );
      assert.equal(
        (await fetch(`${base}/api/config`).then((r) => r.json())).storyteller,
        true,
      );
    });
  } finally {
    eleven.restore();
  }
});

// Agents hold tool ids, so a tool written by an older build keeps its old
// behaviour until something rewrites it. Pinning must not freeze that.
test("tools belonging to our agent are rewritten, and other people's are not", async () => {
  for (const name of [AGENT_NAME, "Someone else's agent"]) {
    const eleven = mockElevenLabs({
      pinnedName: name,
      pinnedAllowsOverrides: true,
      existingTools: true,
    });
    try {
      await withServer(
        { ELEVENLABS_API_KEY: KEY, ELEVENLABS_AGENT_ID: "agent_pinned" },
        async (base) => {
          assert.equal(
            (await post(`${base}/api/storyteller/token`, { profile })).status,
            200,
          );
        },
      );
      const patched = eleven.calls.filter((c) => c.method === "PATCH");
      if (name === AGENT_NAME) {
        assert.deepEqual(
          patched.map((c) => c.body.tool_config.name),
          [SHOW_SCENE_TOOL, TURN_PAGE_TOOL],
        );
        assert.equal(
          patched[1].body.tool_config.execution_mode,
          "post_tool_speech",
          "turn_page must wait for the beat to be spoken",
        );
      } else {
        assert.deepEqual(patched, [], "never rewrite another owner's tools");
      }
    } finally {
      eleven.restore();
    }
  }
});

test("the declared client tools match what the browser is able to parse", () => {
  const names = storytellerTools.map((tool) => tool.name);
  assert.deepEqual(names, [SHOW_SCENE_TOOL, TURN_PAGE_TOOL]);
  for (const tool of storytellerTools) {
    assert.equal(tool.type, "client");
    assert.equal(tool.expects_response, false, "tools must not block speech");
  }
  const [scene, page] = storytellerTools;
  assert.deepEqual(
    [...scene.parameters.required],
    Object.keys(SceneArgsSchema.shape),
  );
  assert.deepEqual(
    [...page.parameters.required],
    Object.keys(PageArgsSchema.shape),
  );
  assert.ok(
    SceneArgsSchema.safeParse({ visual_prompt: "a forest", theme: "forest" })
      .success,
  );
  assert.ok(!SceneArgsSchema.safeParse({ visual_prompt: "a forest" }).success);
});

test("a first-time caller is greeted differently from a returning one", () => {
  const fresh = { profile, topic: "", history: [] };
  assert.match(storytellerGreeting(fresh), /what should our story be about/i);
  assert.match(
    storytellerGreeting({ ...fresh, profile: { ...profile, age: "3–5" } }),
    /What should our story be about\?$/,
  );
  assert.match(
    storytellerInstructions(fresh),
    /Call show_scene whenever the story moves somewhere new/,
  );
});
