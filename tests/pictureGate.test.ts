import { test } from "node:test";
import assert from "node:assert/strict";
import { PictureGate, playWhenReady } from "../src/pictureGate";

test("audio waits through session handover and transport startup until a frame is displayed", async () => {
  const gate = new PictureGate();
  gate.begin();
  let played = false;
  const playback = playWhenReady(
    gate.wait(),
    () => true,
    () => {
      played = true;
    },
  );
  await Promise.resolve();
  assert.equal(played, false);
  gate.ready();
  await playback;
  assert.equal(played, true);
});

test("failed or replaced video never releases old narration when the new picture arrives", async () => {
  const gate = new PictureGate();
  gate.begin();
  const played: string[] = [];
  const old = playWhenReady(
    gate.wait(),
    () => true,
    () => {
      played.push("old");
    },
  );
  gate.begin();
  const next = playWhenReady(
    gate.wait(),
    () => true,
    () => {
      played.push("new");
    },
  );
  gate.ready();
  await Promise.all([old, next]);
  assert.deepEqual(played, ["new"]);
  gate.begin();
  const failed = playWhenReady(
    gate.wait(),
    () => true,
    () => {
      played.push("failed");
    },
  );
  gate.cancel();
  await failed;
  assert.deepEqual(played, ["new"]);
});

test("pause, stop, or navigation cancels a queued voice without cancelling the video", async () => {
  const gate = new PictureGate();
  gate.begin();
  let current = true;
  let played = false;
  const playback = playWhenReady(
    gate.wait(),
    () => current,
    () => {
      played = true;
    },
  );
  current = false;
  gate.ready();
  await playback;
  assert.equal(played, false);
  assert.equal(await gate.wait(), true);
});
