type Session = { type: string };

// Safari can retain its quieter recording route after microphone capture.
// Feature-detect this optional API; unsupported browsers keep their defaults.
export function createAudioSession(getSession: () => Session | undefined) {
  const captures = new Set<symbol>();
  const setType = (type: "playback" | "play-and-record") => {
    try {
      const session = getSession();
      if (session) session.type = type;
    } catch {
      // AudioSession is experimental and must not prevent ordinary playback.
    }
  };
  const playback = () => {
    if (!captures.size) setType("playback");
  };
  return {
    playback,
    capture() {
      const owner = Symbol();
      captures.add(owner);
      setType("play-and-record");
      return () => {
        if (captures.delete(owner)) playback();
      };
    },
  };
}

export const storyAudioSession = createAudioSession(() =>
  typeof navigator === "undefined"
    ? undefined
    : (navigator as Navigator & { audioSession?: Session }).audioSession,
);
