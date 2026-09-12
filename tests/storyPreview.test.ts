import { test } from "node:test";
import assert from "node:assert/strict";
import { PageSchema } from "../shared/story";
import { captionCues } from "../src/mediaLifecycle";
import {
  abortablePreviewDelay,
  previewConfig,
  previewMedia,
  previewPage,
  previewResponse,
  previewStages,
} from "../src/storyPreview";

test("subtitle cues preserve every word and punctuation in a long sentence", () => {
  const text =
    "Mila followed a golden light into the quiet forest, where a little dragon waited beneath the branches. “Hello!” he whispered.";
  const cues = captionCues(text);
  assert.ok(cues.length > 2);
  assert.equal(cues.join(" "), text);
  assert.ok(cues.every((cue) => cue.length <= 56));
});
test("subtitle cues handle empty text, whitespace and single long words", () => {
  assert.deepEqual(captionCues(""), []);
  assert.deepEqual(captionCues("  Hello   little friend.  "), [
    "Hello little friend.",
  ]);
  const word = "a".repeat(80);
  assert.deepEqual(captionCues(word), [word]);
});
test("every preview stage supplies a contract-valid scripted page", () => {
  for (const [stage] of previewStages) {
    assert.ok(PageSchema.safeParse(previewPage(stage)).success, stage);
    assert.ok(
      captionCues(previewPage(stage).narrative).every((c) => c.length <= 56),
    );
  }
});
test("preview explicitly disables providers and skips the book opening", () => {
  assert.deepEqual(previewConfig, {
    openai: false,
    reactor: false,
    elevenlabs: false,
    storyteller: false,
    accessCodeRequired: false,
  });
  assert.equal(previewMedia.intro, null);
  assert.ok(previewMedia.ambient?.mobile.startsWith("/media/welcome/"));
});
test("scripted reactions preserve characters and provide a definite ending", () => {
  assert.equal(previewResponse("Please make it gentler"), "gentler");
  assert.equal(previewResponse("Give this a cozy happy ending"), "ending");
  assert.equal(previewResponse("Follow the fireflies"), "story");
  assert.match(previewPage("gentler").narrative, /Lumo/);
  assert.match(previewPage("ending").narrative, /The end\.$/);
});
test("leaving or pausing a preview cancels delayed story changes", async () => {
  const controller = new AbortController();
  const delayed = abortablePreviewDelay(controller.signal, 200);
  controller.abort();
  await assert.rejects(delayed, { name: "AbortError" });
  await assert.rejects(abortablePreviewDelay(controller.signal, 1), {
    name: "AbortError",
  });
});
test("preview delay completes without a provider call", async () => {
  await abortablePreviewDelay(new AbortController().signal, 1);
});
