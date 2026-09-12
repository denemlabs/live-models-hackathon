import { useCallback, useEffect, useRef, useState } from "react";
import { playWhenReady } from "./pictureGate";

type Options = {
  cloudVoice: boolean;
  enabled: boolean;
  accessCode: string;
  youngReader: boolean;
  onError: (message: string) => void;
  waitForPicture: () => Promise<boolean>;
  allowBrowserVoice: boolean;
};

export function useNarration(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [speaking, setSpeaking] = useState(false);
  const [completion, setCompletion] = useState(0);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const objectUrl = useRef<string | null>(null);

  const release = useCallback(() => {
    request.current?.abort();
    request.current = null;
    if (audio.current) {
      audio.current.onended = null;
      audio.current.onerror = null;
      audio.current.pause();
      audio.current.removeAttribute("src");
      audio.current.load();
      audio.current = null;
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    window.speechSynthesis?.cancel();
  }, []);

  const mute = useCallback(() => {
    generation.current++;
    release();
    setSpeaking(false);
  }, [release]);

  useEffect(() => {
    mute();
  }, [options.enabled, options.cloudVoice, mute]);
  useEffect(
    () => () => {
      generation.current++;
      release();
    },
    [release],
  );

  async function read(text: string, automatic = false) {
    mute();
    if (automatic && !latest.current.enabled) return;
    const current = generation.current;
    const picture = latest.current.waitForPicture();
    const finish = () => {
      if (current !== generation.current) return;
      mute();
    };
    const completed = () => {
      if (current !== generation.current) return;
      finish();
      setCompletion((value) => value + 1);
    };
    let fallbackStarted = false;
    const browserVoice = async () => {
      if (current !== generation.current || fallbackStarted) return;
      if (!latest.current.allowBrowserVoice) {
        latest.current.onError(
          "The storyteller’s voice couldn’t connect. Please retry narration.",
        );
        finish();
        return;
      }
      fallbackStarted = true;
      release();
      await playWhenReady(
        picture,
        () => current === generation.current,
        () => {
          if (!window.speechSynthesis) {
            setSpeaking(false);
            latest.current.onError(
              "Read aloud is unavailable. The story is always shown as text.",
            );
            return;
          }
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = "en-US";
          utterance.rate = latest.current.youngReader ? 0.8 : 0.9;
          utterance.pitch = 1.05;
          utterance.onend = completed;
          utterance.onerror = finish;
          window.speechSynthesis.speak(utterance);
        },
      );
      if (!(await picture)) finish();
    };
    setSpeaking(true); // Stop also cancels audio that is still being prepared.
    if (!latest.current.cloudVoice) {
      browserVoice();
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch("/api/narrate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(latest.current.accessCode
            ? { "x-access-code": latest.current.accessCode }
            : {}),
        },
        body: JSON.stringify({ text }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(60000),
        ]),
      });
      if (!response.ok) throw new Error("Voice unavailable");
      const blob = await response.blob();
      if (current !== generation.current) return;
      objectUrl.current = URL.createObjectURL(blob);
      const player = new Audio(objectUrl.current);
      audio.current = player;
      player.onended = completed;
      player.onerror = () => {
        if (current !== generation.current) return;
        latest.current.onError(
          "The narration couldn’t play. Please retry narration.",
        );
        browserVoice();
      };
      await playWhenReady(
        picture,
        () => current === generation.current,
        () => player.play(),
      );
      if (!(await picture)) finish();
    } catch {
      if (current !== generation.current) return;
      latest.current.onError(
        "The storyteller’s voice is unavailable. Please retry narration.",
      );
      browserVoice();
    }
  }
  return { speaking, completion, read, mute };
}
