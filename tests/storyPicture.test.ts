import { test } from "node:test";
import assert from "node:assert/strict";
import { updateStoryPicture } from "../src/storyPicture";
import { PictureGate, playWhenReady } from "../src/pictureGate";
import { demoPage, StoryRequestSchema } from "../shared/story";

const page = {
  ...demoPage(StoryRequestSchema.parse({ input: "A dragon", profile: {} })),
  visualUpdate: "redraw" as const,
  visualPrompt: "A dragon with bright pink scales beside a pond.",
  visualChange: "The dragon's scales are visibly pink across its whole body.",
};
test("pink scales restart the model run and hold narration for the new picture", async () => {
  const gate = new PictureGate();
  gate.begin();
  gate.ready();
  const calls: string[] = [];
  updateStoryPicture(
    {
      resetStory: () => {
        calls.push("reset");
        gate.cancel();
      },
      steer: (scene, change) => {
        calls.push("steer");
        assert.equal(scene, page.visualPrompt);
        assert.equal(change, page.visualChange);
        gate.begin();
      },
    },
    page,
    false,
    true,
  );
  assert.deepEqual(calls, ["reset", "steer"]);
  let spoken = false;
  const voice = playWhenReady(
    gate.wait(),
    () => true,
    () => {
      spoken = true;
    },
  );
  await Promise.resolve();
  assert.equal(spoken, false);
  gate.ready();
  await voice;
  assert.equal(spoken, true);
});
test("ordinary movements retain the run and prepared choices are not sent twice", () => {
  const calls: string[] = [];
  const pictures = {
    resetStory: () => calls.push("reset"),
    steer: () => calls.push("steer"),
  };
  const movement = { ...page, visualUpdate: "continue" as const };
  updateStoryPicture(pictures, movement, false, true);
  assert.deepEqual(calls, []);
  updateStoryPicture(pictures, movement, false, false);
  assert.deepEqual(calls, ["steer"]);
  updateStoryPicture(pictures, page, true, false);
  assert.deepEqual(calls, ["steer", "steer"]);
});

test("the exact pink answer redraws even when the model misses the redraw flag", () => {
  const calls: string[] = [];
  updateStoryPicture(
    {
      resetStory: () => {
        calls.push("reset");
      },
      steer: (scene) => {
        assert.match(scene, /pink/);
        calls.push("steer");
      },
    },
    { ...page, visualUpdate: "continue", visualChange: "" },
    false,
    false,
    "I think they are pink.",
  );
  assert.deepEqual(calls, ["reset", "steer"]);
});
