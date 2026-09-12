import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
export function useMicrophone(
  accessCode: string,
  onTranscript: (text: string) => void,
  onError: (error: string) => void,
) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const media = useRef<MediaStream | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const callbacks = useRef({ onTranscript, onError });
  callbacks.current = { onTranscript, onError };
  const cancel = useCallback(() => {
    generation.current++;
    clearTimeout(timeout.current);
    abort.current?.abort();
    if (recorder.current?.state === "recording") {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    media.current?.getTracks().forEach((t) => t.stop());
    media.current = null;
    setRecording(false);
    setRequesting(false);
    setTranscribing(false);
  }, []);
  const toggle = useCallback(async () => {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      return;
    }
    const current = ++generation.current;
    setRequesting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "This browser cannot record audio. Please type your idea instead.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (generation.current !== current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      media.current = stream;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
      ].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.current = r;
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = async () => {
        clearTimeout(timeout.current);
        stream.getTracks().forEach((t) => t.stop());
        media.current = null;
        if (generation.current !== current) return;
        setRecording(false);
        setTranscribing(true);
        const controller = new AbortController();
        abort.current = controller;
        const transcribeTimeout = setTimeout(() => controller.abort(), 60000);
        try {
          const form = new FormData();
          form.append(
            "audio",
            new Blob(chunks, { type: r.mimeType || "audio/webm" }),
            r.mimeType.includes("mp4") ? "voice.mp4" : "voice.webm",
          );
          const { text } = await api<{ text: string }>(
            "/api/transcribe",
            form,
            accessCode,
            controller.signal,
          );
          if (generation.current !== current) return;
          if (text.trim()) callbacks.current.onTranscript(text.trim());
          else
            callbacks.current.onError(
              "We didn’t catch any words. Try again or type your idea.",
            );
        } catch (e) {
          if (generation.current === current)
            callbacks.current.onError(
              e instanceof Error ? e.message : "Please try recording again.",
            );
        } finally {
          clearTimeout(transcribeTimeout);
          if (generation.current === current) setTranscribing(false);
        }
      };
      r.onerror = () => {
        cancel();
        callbacks.current.onError(
          "The microphone stopped. Please try again or type.",
        );
      };
      r.start();
      setRecording(true);
      setRequesting(false);
      timeout.current = setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 30000);
    } catch (e) {
      if (generation.current === current) {
        setRequesting(false);
        callbacks.current.onError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Microphone permission was declined. You can still type your idea below."
            : e instanceof Error
              ? e.message
              : "The microphone isn’t available. Please type instead.",
        );
      }
    }
  }, [accessCode, cancel]);
  useEffect(() => () => cancel(), [cancel]);
  return { recording, transcribing, requesting, toggle, cancel };
}
