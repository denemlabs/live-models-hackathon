import { test } from "node:test";
import assert from "node:assert/strict";
import {
  onFirstFrame,
  stagePhase,
  storySentences,
} from "../src/mediaLifecycle";

class FakeVideo extends EventTarget {
  paused = true;
  readyState = 0;
  videoWidth = 0;
  callback?: () => void;
  cancelled = false;
  requestVideoFrameCallback = (callback: () => void) => {
    this.callback = callback;
    return 7;
  };
  cancelVideoFrameCallback = () => {
    this.cancelled = true;
  };
  asVideo() {
    return this as unknown as HTMLVideoElement;
  }
}

test("a stream, metadata and playing alone do not reveal live video", () => {
  const video = new FakeVideo();
  let count = 0;
  onFirstFrame(video.asVideo(), () => count++);
  video.dispatchEvent(new Event("loadedmetadata"));
  video.dispatchEvent(new Event("playing"));
  assert.equal(count, 0);
  video.paused = false;
  video.readyState = 2;
  video.videoWidth = 1920;
  video.callback?.();
  video.callback?.();
  assert.equal(count, 1);
});

test("a loaded frame while autoplay is blocked does not count as playing", () => {
  const video = new FakeVideo();
  video.readyState = 2;
  video.videoWidth = 1920;
  let ready = false;
  onFirstFrame(video.asVideo(), () => {
    ready = true;
  });
  video.callback?.();
  assert.equal(ready, false);
  video.paused = false;
  video.callback?.();
  assert.equal(ready, true);
});

test("replaced stream callbacks cannot reveal a stale stream", () => {
  const video = new FakeVideo();
  let ready = false;
  const cancel = onFirstFrame(video.asVideo(), () => {
    ready = true;
  });
  cancel();
  video.callback?.();
  assert.equal(video.cancelled, true);
  assert.equal(ready, false);
});

test("legacy frame fallback requires playing, dimensions and decoded data", () => {
  const video = new FakeVideo();
  Object.defineProperty(video, "requestVideoFrameCallback", {
    value: undefined,
  });
  let ready = 0;
  onFirstFrame(video.asVideo(), () => ready++);
  video.dispatchEvent(new Event("playing"));
  assert.equal(ready, 0);
  video.readyState = 2;
  video.videoWidth = 1920;
  video.dispatchEvent(new Event("loadeddata"));
  assert.equal(ready, 0);
  video.paused = false;
  video.dispatchEvent(new Event("playing"));
  assert.equal(ready, 1);
});

test("legacy callback cleanup survives unmount before decoding", () => {
  const video = new FakeVideo();
  Object.defineProperty(video, "requestVideoFrameCallback", {
    value: undefined,
  });
  const cancel = onFirstFrame(video.asVideo(), () =>
    assert.fail("stale callback"),
  );
  cancel();
  video.paused = false;
  video.readyState = 3;
  video.videoWidth = 1920;
  video.dispatchEvent(new Event("playing"));
});

const base = { paused: false, live: false, connecting: false, opened: false };
test("opening can connect immediately without waiting for the intro", () => {
  assert.equal(stagePhase(base), "opening");
  assert.equal(stagePhase({ ...base, connecting: true }), "connecting");
});
test("slow connection stays connecting until a decoded live frame", () => {
  assert.equal(
    stagePhase({ ...base, opened: true, connecting: true }),
    "connecting",
  );
  assert.equal(
    stagePhase({ ...base, opened: true, connecting: true, live: true }),
    "live",
  );
});
test("pause takes priority, resume restores actual media state", () => {
  assert.equal(stagePhase({ ...base, live: true, paused: true }), "paused");
  assert.equal(stagePhase({ ...base, live: true }), "live");
  assert.equal(stagePhase({ ...base, opened: true }), "ambient");
});
test("failed or disconnected live returns to ambient, not Live", () => {
  assert.equal(stagePhase({ ...base, opened: true, live: false }), "ambient");
});
test("manual captions preserve sentence punctuation and remaining text", () => {
  assert.deepEqual(
    storySentences("Hello! “Come with me,” she said. A quiet path"),
    ["Hello!", "“Come with me,” she said.", "A quiet path"],
  );
  assert.deepEqual(storySentences(""), []);
});
