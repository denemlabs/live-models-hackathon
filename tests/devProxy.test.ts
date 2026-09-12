import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { developmentApi } from "../server/devProxy";

test("local live proxy forwards choices and binary voice to the shared backend without forwarding browser origin", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; body: string; headers: Headers }[] = [];
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://story.example")) {
      calls.push({
        url: String(input),
        body: String(init?.body ?? ""),
        headers: new Headers(init?.headers),
      });
      if (String(input).endsWith("/api/narrate"))
        return new Response(new Uint8Array([73, 68, 51]), {
          headers: { "content-type": "audio/mpeg" },
        });
      return Response.json({ selected: 1 });
    }
    return original(input, init);
  };
  const app = express();
  app.use("/api", developmentApi("https://story.example"));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const body = JSON.stringify({ input: "Find a friend", choiceIndex: 1 });
    const response = await fetch(base + "/api/story", {
      method: "POST",
      headers: {
        origin: base,
        "content-type": "application/json",
        "x-access-code": "test-code",
      },
      body,
    });
    assert.deepEqual(await response.json(), { selected: 1 });
    assert.equal(calls[0].body, body);
    assert.equal(calls[0].headers.get("origin"), null);
    assert.equal(calls[0].headers.get("x-access-code"), "test-code");
    const audio = await fetch(base + "/api/narrate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"text":"Option one"}',
    });
    assert.equal(audio.headers.get("content-type"), "audio/mpeg");
    assert.deepEqual(
      [...new Uint8Array(await audio.arrayBuffer())],
      [73, 68, 51],
    );
    for (const origin of ["https://unrelated.example", "null"]) {
      assert.equal(
        (
          await fetch(base + "/api/story", {
            method: "POST",
            headers: { origin },
            body: "{}",
          })
        ).status,
        403,
      );
    }
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = original;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
