import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app";
import {
  demoPage,
  ProfileSchema,
  StoryRequestSchema,
  finalizePage,
  storyInstructions,
  engagementPlan,
  type StoryPage,
} from "../shared/story";

const profile = ProfileSchema.parse({});

test("story questions vary across a long, capped history and accept open-ended answers", () => {
  const history: StoryPage[] = [];
  const questions = new Set<string>();
  let openTurns = 0;
  for (let i = 0; i < 18; i++) {
    const request = StoryRequestSchema.parse({
      input: i ? "A rainbow bubble bridge" : "A fox in the forest",
      profile,
      history: history.slice(-12),
      interaction: "continue",
      demo: true,
    });
    const page = demoPage(request);
    assert.notEqual(page.questionStyle, history.at(-1)?.questionStyle);
    assert.ok([0, 2].includes(page.choices.length));
    assert.equal(
      page.choices.length === 0,
      engagementPlan(request.history).openEnded,
    );
    assert.equal(page.responseKind, "story");
    assert.doesNotMatch(page.question, /what should .* do next/i);
    questions.add(page.question);
    if (!page.choices.length) openTurns++;
    history.push(page);
  }
  assert.equal(questions.size, 6);
  assert.equal(openTurns, 6);
  const aside = {
    ...history.at(-1)!,
    responseKind: "answer" as const,
    questionStyle: "invent" as const,
  };
  assert.deepEqual(
    engagementPlan([...history, aside]),
    engagementPlan(history),
  );
});

test("demo API returns an open question then continues after the child's own answer", async () => {
  await withServer({}, async (base) => {
    const history: StoryPage[] = [];
    for (const input of [
      "A fox",
      "Its warm glow",
      "A tiny singing flower",
      "A rainbow bubble bridge",
    ]) {
      const response = await post(`${base}/api/story`, {
        input,
        profile,
        history,
        demo: true,
        interaction: "continue",
      });
      assert.equal(response.status, 200);
      const { page } = await response.json();
      history.push(page);
    }
    assert.deepEqual(history[2].choices, []);
    assert.equal(history[3].choices.length, 2);
    assert.equal(history[3].title, history[0].title);
  });
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
const post = (url: string, data: unknown, headers = {}) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  });

test("demo works without keys, preserves the theme, and responds to discomfort", async () => {
  await withServer({}, async (base) => {
    const first = await post(`${base}/api/story`, {
      input: "A turtle under the ocean",
      profile,
      demo: true,
    });
    assert.equal(first.status, 200);
    const { page } = await first.json();
    assert.equal(page.theme, "ocean");
    const next = await post(`${base}/api/story`, {
      input: "I feel scared, please be gentler",
      history: [page],
      profile,
      demo: true,
    });
    const data = await next.json();
    assert.equal(data.page.theme, "ocean");
    assert.match(data.page.narrative, /peaceful/);
    assert.equal(data.page.title, page.title);
  });
});
test("invalid input and unconfigured live providers fail clearly without silently generating demo content", async () => {
  await withServer({}, async (base) => {
    assert.equal(
      (await post(`${base}/api/story`, { input: "", profile, demo: true }))
        .status,
      400,
    );
    assert.equal(
      (
        await post(`${base}/api/story`, {
          input: "x".repeat(1001),
          profile,
          demo: true,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post(`${base}/api/story`, {
          input: "A fox",
          profile,
          demo: false,
        })
      ).status,
      503,
    );
    assert.equal((await post(`${base}/api/reactor/token`, {})).status, 503);
    assert.equal((await fetch(`${base}/api/not-found`)).status, 404);
  });
});
test("cross-origin requests and missing access codes cannot spend provider keys", async () => {
  await withServer({ APP_ACCESS_CODE: "test-access" }, async (base) => {
    const body = { input: "A little fox", profile, demo: true };
    assert.equal((await post(`${base}/api/story`, body)).status, 401);
    assert.equal(
      (await post(`${base}/api/story`, body, { "x-access-code": "wrong" }))
        .status,
      401,
    );
    assert.equal(
      (
        await post(`${base}/api/story`, body, {
          "x-access-code": "test-access",
          origin: "https://unrelated.example",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await post(`${base}/api/story`, body, {
          "x-access-code": "test-access",
          origin: base,
        })
      ).status,
      200,
    );
    const config = await (await fetch(`${base}/api/config`)).json();
    assert.equal(config.accessCodeRequired, true);
    assert.ok(!JSON.stringify(config).includes("test-access"));
  });
});
test("recording endpoint rejects unsupported content before provider calls", async () => {
  await withServer({ OPENAI_API_KEY: "test-not-a-real-key" }, async (base) => {
    const file = new FormData();
    file.append(
      "audio",
      new Blob(["not audio".repeat(20)], { type: "text/plain" }),
      "input.txt",
    );
    assert.equal(
      (await fetch(`${base}/api/transcribe`, { method: "POST", body: file }))
        .status,
      400,
    );
  });
});
test("young-reader and accessibility preferences shorten text and shape prompt constraints", () => {
  const data = StoryRequestSchema.parse({
    input: "forest",
    profile,
    demo: true,
  });
  assert.ok(
    demoPage({ ...data, profile: { ...profile, simpleLanguage: true } })
      .narrative.length < demoPage(data).narrative.length,
  );
  const instructions = storyInstructions({
    ...profile,
    reducedMotion: true,
    simpleLanguage: true,
  });
  assert.match(instructions, /Keep camera still/);
  assert.match(instructions, /very short concrete sentences/);
  assert.match(instructions, /never infer a diagnosis/);
});

test("Reactor token exchange is server-only, model scoped, and limited to one session", async () => {
  const original = globalThis.fetch;
  let payload: any;
  globalThis.fetch = async (input, init) => {
    if (String(input) === "https://api.reactor.inc/tokens") {
      assert.equal(
        (init!.headers as Record<string, string>)["Reactor-API-Key"],
        "test-reactor-secret",
      );
      payload = JSON.parse(init!.body as string);
      return new Response(JSON.stringify({ jwt: "test-short-lived-token" }), {
        status: 200,
      });
    }
    return original(input, init);
  };
  try {
    await withServer(
      { REACTOR_API_KEY: "test-reactor-secret" },
      async (base) => {
        const response = await post(`${base}/api/reactor/token`, {});
        const data = await response.json();
        assert.equal(response.status, 200);
        assert.equal(data.jwt, "test-short-lived-token");
        assert.ok(!JSON.stringify(data).includes("test-reactor-secret"));
        assert.equal(
          payload.authorization_details[0].constraints.max_sessions,
          1,
        );
        assert.deepEqual(
          payload.authorization_details[0].resources.models.match,
          ["reactor/visko-orbis-stable"],
        );
        assert.equal(payload.expires_after, 600);
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("Railway healthcheck is public and HTTPS proxy requests retain origin validation", async () => {
  await withServer(
    { RAILWAY_ENVIRONMENT_ID: "test-env", APP_ACCESS_CODE: "test-access" },
    async (base) => {
      const health = await fetch(`${base}/healthz`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { status: "ok" });
      const body = { input: "A friendly fox", profile, demo: true };
      const headers = {
        "x-access-code": "test-access",
        "x-forwarded-proto": "https",
        "x-forwarded-for": "192.0.2.10",
        origin: base.replace("http:", "https:"),
      };
      assert.equal(
        (await post(`${base}/api/story`, body, headers)).status,
        200,
      );
      assert.equal(
        (
          await post(`${base}/api/story`, body, {
            ...headers,
            origin: "https://unrelated.example",
          })
        ).status,
        403,
      );
    },
  );
});

test("narration validates input and requires a configured provider", async () => {
  await withServer({}, async (base) => {
    for (const text of ["", " ", "x".repeat(2001), 123]) {
      assert.equal((await post(`${base}/api/narrate`, { text })).status, 400);
    }
    assert.equal(
      (await post(`${base}/api/narrate`, { text: "A friendly fox." })).status,
      503,
    );
  });
});

test("narration returns audio while keeping provider keys and failures private", async () => {
  const original = globalThis.fetch;
  let fail = false;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://api.elevenlabs.io/")) {
      assert.equal(
        (init!.headers as Record<string, string>)["xi-api-key"],
        "test-voice-secret",
      );
      assert.match(
        String(input),
        /test-voice\/stream\?output_format=mp3_44100_128$/,
      );
      const data = JSON.parse(init!.body as string);
      assert.equal(data.text, "A friendly fox.");
      assert.equal(data.model_id, "eleven_flash_v2_5");
      assert.equal(data.apiKey, undefined);
      return fail
        ? new Response("private provider details test-voice-secret", {
            status: 401,
          })
        : new Response(new Uint8Array([73, 68, 51, 4]), {
            headers: { "Content-Type": "audio/mpeg" },
          });
    }
    return original(input, init);
  };
  try {
    await withServer(
      {
        ELEVENLABS_API_KEY: "test-voice-secret",
        ELEVENLABS_VOICE_ID: "test-voice",
        APP_ACCESS_CODE: "test-access",
      },
      async (base) => {
        const body = { text: "A friendly fox." };
        assert.equal((await post(`${base}/api/narrate`, body)).status, 401);
        const headers = { "x-access-code": "test-access" };
        assert.equal(
          (
            await post(`${base}/api/narrate`, body, {
              ...headers,
              origin: "https://unrelated.example",
            })
          ).status,
          403,
        );
        const response = await post(`${base}/api/narrate`, body, headers);
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type")!, /^audio\/mpeg/);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.deepEqual(
          new Uint8Array(await response.arrayBuffer()),
          new Uint8Array([73, 68, 51, 4]),
        );
        const config = await (await fetch(`${base}/api/config`)).json();
        assert.equal(config.elevenlabs, true);
        assert.ok(!JSON.stringify(config).includes("test-voice-secret"));
        fail = true;
        const failed = await post(`${base}/api/narrate`, body, headers);
        assert.equal(failed.status, 502);
        assert.ok(!(await failed.text()).includes("test-voice-secret"));
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("questions preserve the scene and explicit modes override model routing", () => {
  const start = StoryRequestSchema.parse({
    input: "moon rabbit",
    profile,
    demo: true,
  });
  const first = demoPage(start);
  const question = StoryRequestSchema.parse({
    ...start,
    input: "Why does the moon shine?",
    history: [first],
    interaction: "question",
  });
  const answer = demoPage(question);
  assert.equal(answer.responseKind, "answer");
  assert.match(answer.narrative, /Sunlight/);
  assert.equal(answer.visualPrompt, first.visualPrompt);
  assert.equal(answer.visualChange, "");
  const corrected = finalizePage(
    {
      ...answer,
      responseKind: "story",
      theme: "forest",
      title: "Wrong title",
      visualPrompt: "Wrong scene",
    },
    question,
  );
  assert.equal(corrected.responseKind, "answer");
  assert.equal(corrected.title, first.title);
  assert.equal(corrected.theme, first.theme);
  assert.equal(corrected.visualPrompt, first.visualPrompt);
  const continuation = demoPage({
    ...question,
    input: "Find a friend",
    interaction: "continue",
  });
  assert.equal(continuation.responseKind, "story");
  assert.ok(continuation.visualChange);
});

test("calm, simpler words, and endings are separate story actions", async () => {
  await withServer({}, async (base) => {
    const initial = await (
      await post(`${base}/api/story`, { input: "forest", profile, demo: true })
    ).json();
    for (const [interaction, kind] of [
      ["calm", "calm"],
      ["simplify", "simplify"],
      ["ending", "ending"],
    ]) {
      const response = await post(`${base}/api/story`, {
        input: "Please help",
        profile,
        demo: true,
        history: [initial.page],
        interaction,
      });
      assert.equal(response.status, 200);
      const { page } = await response.json();
      assert.equal(page.responseKind, kind);
      assert.equal(page.title, initial.page.title);
      if (kind === "simplify") assert.equal(page.visualChange, "");
      if (kind === "ending") assert.match(page.narrative, /The end/);
    }
    assert.equal(
      (
        await post(`${base}/api/story`, {
          input: "forest",
          profile,
          demo: true,
          interaction: "execute-code",
        })
      ).status,
      400,
    );
  });
});

test("backup token uses only the backup credential and rejects unknown providers", async () => {
  const original = globalThis.fetch;
  const used: string[] = [];
  globalThis.fetch = async (input, init) => {
    if (String(input) === "https://api.reactor.inc/tokens") {
      used.push((init!.headers as Record<string, string>)["Reactor-API-Key"]);
      return new Response(JSON.stringify({ jwt: "scoped-session-token" }), {
        status: 200,
      });
    }
    return original(input, init);
  };
  try {
    await withServer(
      {
        REACTOR_API_KEY: "primary-secret",
        REACTOR_API_KEY_BACKUP: "backup-secret",
      },
      async (base) => {
        for (const provider of ["primary", "backup"]) {
          const response = await post(`${base}/api/reactor/token`, {
            provider,
          });
          assert.equal(response.status, 200);
          const data = await response.json();
          assert.equal(data.backupAvailable, true);
          assert.ok(!JSON.stringify(data).includes("secret"));
        }
        assert.equal(
          (
            await post(`${base}/api/reactor/token`, {
              provider: "arbitrary-key",
            })
          ).status,
          400,
        );
        assert.deepEqual(used, ["primary-secret", "backup-secret"]);
      },
    );
    await withServer({ REACTOR_API_KEY: "primary-secret" }, async (base) => {
      assert.equal(
        (await post(`${base}/api/reactor/token`, { provider: "backup" }))
          .status,
        503,
      );
      assert.equal(used.length, 2);
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("HTTP session creation retains ownership after the response closes normally", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "video-route-"));
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://api.reactor.inc")) {
      if (String(input).endsWith("/tokens"))
        return Response.json({ jwt: "fake-session-token" });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (init?.method === "POST")
        return Response.json({ session_id: `test-session-${++count}` });
      return Response.json({ state: "CLOSED" });
    }
    return original(input, init);
  };
  try {
    await withServer(
      {
        REACTOR_API_KEY: "fake-api-key",
        VIDEO_SESSION_STORE: join(directory, "session.json"),
      },
      async (base) => {
        const first = await (
          await post(`${base}/api/reactor/session`, {})
        ).json();
        const second = await (
          await post(`${base}/api/reactor/session`, {})
        ).json();
        await post(`${base}/api/reactor/session/release`, {
          leaseId: first.leaseId,
        });
        assert.deepEqual(
          await (
            await post(`${base}/api/reactor/session/heartbeat`, {
              leaseId: second.leaseId,
            })
          ).json(),
          { active: true },
        );
        await post(`${base}/api/reactor/session/release`, {
          leaseId: second.leaseId,
        });
      },
    );
  } finally {
    globalThis.fetch = original;
    await rm(directory, { recursive: true, force: true });
  }
});
