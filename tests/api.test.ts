import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app";
import { demoPage, ProfileSchema, storyInstructions } from "../shared/story";

const profile = ProfileSchema.parse({});
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
  const data = { input: "forest", topic: "", history: [], profile, demo: true };
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
