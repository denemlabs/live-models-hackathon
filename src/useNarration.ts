import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  elevenlabs: boolean;
  enabled: boolean;
  accessCode: string;
  youngReader: boolean;
  onError: (message: string) => void;
};

export function useNarration(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [speaking, setSpeaking] = useState(false);
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
  }, [options.enabled, options.elevenlabs, mute]);
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
    const finish = () => {
      if (current !== generation.current) return;
      mute();
    };
    let fallbackStarted = false;
    const browserVoice = () => {
      if (current !== generation.current || fallbackStarted) return;
      fallbackStarted = true;
      release();
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
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    };
    setSpeaking(true); // Stop also cancels audio that is still being prepared.
    if (!latest.current.elevenlabs) {
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
          AbortSignal.timeout(35000),
        ]),
      });
      if (!response.ok) throw new Error("Voice unavailable");
      const blob = await response.blob();
      if (current !== generation.current) return;
      objectUrl.current = URL.createObjectURL(blob);
      const player = new Audio(objectUrl.current);
      audio.current = player;
      player.onended = finish;
      player.onerror = () => {
        if (current !== generation.current) return;
        latest.current.onError(
          "ElevenLabs audio couldn’t play. Using the browser voice.",
        );
        browserVoice();
      };
      await player.play();
    } catch {
      if (current !== generation.current) return;
      latest.current.onError(
        "ElevenLabs narration is unavailable. Using the browser voice.",
      );
      browserVoice();
    }
  }
  return { speaking, read, mute };
}
