import assert from "node:assert/strict";
import test from "node:test";
import { createAudioSession } from "../src/audioSession";

test("stopping capture restores the playback route before the next narration", () => {
  const session = { type: "auto" };
  const audio = createAudioSession(() => session);
  audio.playback();
  assert.equal(session.type, "playback");
  const stop = audio.capture();
  assert.equal(session.type, "play-and-record");
  audio.playback();
  assert.equal(session.type, "play-and-record");
  stop();
  assert.equal(session.type, "playback");
});

test("overlapping capture and stale cleanup cannot switch an active microphone to playback", () => {
  const session = { type: "auto" };
  const audio = createAudioSession(() => session);
  const stopFirst = audio.capture();
  const stopSecond = audio.capture();
  stopFirst();
  audio.playback();
  assert.equal(session.type, "play-and-record");
  stopSecond();
  assert.equal(session.type, "playback");
  const stopThird = audio.capture();
  stopFirst();
  stopSecond();
  assert.equal(session.type, "play-and-record");
  stopThird();
  assert.equal(session.type, "playback");
});

test("unsupported or restricted audio session APIs never prevent recording or playback", () => {
  for (const getSession of [
    () => undefined,
    () => {
      throw new Error("unsupported");
    },
    () => ({
      get type() {
        return "auto";
      },
      set type(_value: string) {
        throw new Error("restricted");
      },
    }),
  ]) {
    const audio = createAudioSession(getSession);
    assert.doesNotThrow(() => {
      audio.playback();
      const stop = audio.capture();
      stop();
    });
  }
});
