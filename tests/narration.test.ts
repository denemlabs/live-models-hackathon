import { test } from "node:test";
import assert from "node:assert/strict";
import type OpenAI from "openai";
import { createNarration } from "../server/narration";
import { STORY_VOICES, storyVoice, voiceId } from "../shared/voices";

test("ElevenLabs quota falls back to OpenAI and avoids repeated quota delays", async () => {
  const original = globalThis.fetch;
  // Falling back is logged for the developer; keep it out of the test output.
  const logError = console.error;
  console.error = () => {};
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
        undefined,
        new AbortController().signal,
      );
      assert.equal(result.provider, "openai");
      assert.equal(result.audio.length, 4);
    }
    assert.equal(elevenRequests, 1);
    assert.equal(openaiRequests, 2);
  } finally {
    globalThis.fetch = original;
    console.error = logError;
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
        undefined,
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
    undefined,
    new AbortController().signal,
  );
  assert.equal(result.provider, "openai");
  assert.equal(result.audio.length, 3);
});

test("the picked narrator is kept by both providers", async () => {
  const original = globalThis.fetch;
  const logError = console.error;
  console.error = () => {};
  const spokenBy = { elevenlabs: [] as string[], openai: [] as string[] };
  let elevenWorks = true;
  globalThis.fetch = async (input) => {
    spokenBy.elevenlabs.push(
      new URL(String(input)).pathname.split("/").at(-2)!,
    );
    return elevenWorks
      ? new Response(new Uint8Array([73, 68, 51, 4]), {
          headers: { "Content-Type": "audio/mpeg" },
        })
      : Response.json({ detail: { status: "invalid" } }, { status: 402 });
  };
  const openai = {
    audio: {
      speech: {
        create: async (body: { voice: string }) => {
          spokenBy.openai.push(body.voice);
          return new Response(new Uint8Array([1, 2, 3]));
        },
      },
    },
  } as unknown as OpenAI;
  try {
    const narrate = createNarration({ ELEVENLABS_API_KEY: "k" }, openai);
    const signal = () => new AbortController().signal;
    for (const voice of STORY_VOICES)
      assert.equal(
        (await narrate("A fox.", voice.key, signal())).provider,
        "elevenlabs",
      );
    // Losing ElevenLabs must not collapse both narrators onto one voice.
    elevenWorks = false;
    for (const voice of STORY_VOICES)
      assert.equal(
        (await narrate("A fox.", voice.key, signal())).provider,
        "openai",
      );
    assert.deepEqual(spokenBy.elevenlabs.slice(0, 2), [
      voiceId("arthur"),
      voiceId("victoria"),
    ]);
    assert.deepEqual(spokenBy.openai, [
      storyVoice("arthur").openai,
      storyVoice("victoria").openai,
    ]);
    assert.notEqual(spokenBy.openai[0], spokenBy.openai[1]);
  } finally {
    globalThis.fetch = original;
    console.error = logError;
  }
});
