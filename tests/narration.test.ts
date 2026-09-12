import { test } from "node:test";
import assert from "node:assert/strict";
import type OpenAI from "openai";
import { createNarration } from "../server/narration";

test("ElevenLabs quota falls back to OpenAI and avoids repeated quota delays", async () => {
  const original = globalThis.fetch;
  let elevenRequests = 0;
  let openaiRequests = 0;
  globalThis.fetch = async () => {
    elevenRequests++;
    return Response.json(
      { detail: { status: "quota_exceeded" } },
      { status: 401 },
    );
  };
  const openai = {
    audio: {
      speech: {
        create: async (body: { input: string; voice: string }) => {
          openaiRequests++;
          assert.equal(
            body.input,
            "Story. Option one: flowers. Option two: stars.",
          );
          assert.equal(body.voice, "marin");
          return new Response(new Uint8Array([73, 68, 51, 4]));
        },
      },
    },
  } as unknown as OpenAI;
  try {
    const narrate = createNarration({ ELEVENLABS_API_KEY: "test-key" }, openai);
    for (let i = 0; i < 2; i++) {
      const result = await narrate(
        "Story. Option one: flowers. Option two: stars.",
        new AbortController().signal,
      );
      assert.equal(result.provider, "openai");
      assert.equal(result.audio.length, 4);
    }
    assert.equal(elevenRequests, 1);
    assert.equal(openaiRequests, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("cancelled ElevenLabs requests never start fallback narration", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  let fallback = false;
  globalThis.fetch = async () => {
    controller.abort();
    throw new Error("aborted");
  };
  const openai = {
    audio: {
      speech: {
        create: async () => {
          fallback = true;
          return new Response();
        },
      },
    },
  } as unknown as OpenAI;
  try {
    await assert.rejects(
      createNarration({ ELEVENLABS_API_KEY: "test-key" }, openai)(
        "Story",
        controller.signal,
      ),
    );
    assert.equal(fallback, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("OpenAI narration works without an ElevenLabs key", async () => {
  const openai = {
    audio: {
      speech: { create: async () => new Response(new Uint8Array([1, 2, 3])) },
    },
  } as unknown as OpenAI;
  const result = await createNarration({}, openai)(
    "A moon rabbit.",
    new AbortController().signal,
  );
  assert.equal(result.provider, "openai");
  assert.equal(result.audio.length, 3);
});
