export type StagePhase =
  "opening" | "ambient" | "connecting" | "live" | "paused";

export function stagePhase(input: {
  paused: boolean;
  live: boolean;
  connecting: boolean;
  opened: boolean;
}): StagePhase {
  if (input.paused) return "paused";
  if (input.live) return "live";
  if (input.connecting) return "connecting";
  return input.opened ? "ambient" : "opening";
}

// A track or canplay event is not proof that a frame has reached the screen.
// The fallback requires playing AND decoded image data on older browsers.
export function onFirstFrame(video: HTMLVideoElement, ready: () => void) {
  let active = true;
  let frame: number | undefined;
  const finish = () => {
    if (!active) return;
    active = false;
    cleanup();
    ready();
  };
  const fallback = () => {
    if (!video.paused && video.readyState >= 2 && video.videoWidth > 0)
      finish();
  };
  const presented = () => {
    if (!active) return;
    // Browsers may present the initial loaded frame even when play() rejected.
    // It is not a playing frame and must not hide the manual-play recovery UI.
    if (!video.paused && video.readyState >= 2 && video.videoWidth > 0)
      finish();
    else frame = video.requestVideoFrameCallback(presented);
  };
  const cleanup = () => {
    if (frame !== undefined) video.cancelVideoFrameCallback?.(frame);
    video.removeEventListener("playing", fallback);
    video.removeEventListener("loadeddata", fallback);
  };
  if (typeof video.requestVideoFrameCallback === "function") {
    frame = video.requestVideoFrameCallback(presented);
  } else {
    video.addEventListener("playing", fallback);
    video.addEventListener("loadeddata", fallback);
    fallback();
  }
  return () => {
    active = false;
    cleanup();
  };
}

export function storySentences(text: string): string[] {
  // Manual reading units, deliberately independent from narration timing.
  return (
    text
      .match(/[^.!?]+(?:[.!?]+[”’"]?|$)/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? []
  );
}

// Short reading cues, not timed captions. Preserve all words and punctuation.
export function captionCues(text: string, maxChars = 56): string[] {
  const cues: string[] = [];
  for (const sentence of storySentences(text)) {
    let cue = "";
    for (const word of sentence.split(/\s+/)) {
      if (cue && cue.length + word.length + 1 > maxChars) {
        cues.push(cue);
        cue = word;
      } else cue = cue ? `${cue} ${word}` : word;
    }
    if (cue) cues.push(cue);
  }
  return cues;
}
