import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { SpeechTurn } from "./speechTurn";
import { storyAudioSession } from "./audioSession";
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
  const pendingPermission = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const stopMeter = useRef<() => void>(() => {});
  const releaseCapture = useRef<() => void>(() => {});
  const callbacks = useRef({ onTranscript, onError });
  callbacks.current = { onTranscript, onError };
  const cancel = useCallback(() => {
    generation.current++;
    pendingPermission.current = false;
    stopMeter.current();
    clearTimeout(timeout.current);
    abort.current?.abort();
    if (recorder.current?.state === "recording") {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    media.current?.getTracks().forEach((t) => t.stop());
    media.current = null;
    releaseCapture.current();
    setRecording(false);
    setRequesting(false);
    setTranscribing(false);
  }, []);
  const toggle = useCallback(
    async (autoStop = false) => {
      if (recorder.current?.state === "recording") {
        recorder.current.stop();
        return;
      }
      if (media.current || pendingPermission.current) return;
      const current = ++generation.current;
      pendingPermission.current = true;
      setRequesting(true);
      const releaseAudio = storyAudioSession.capture();
      releaseCapture.current = releaseAudio;
      let ownedStream: MediaStream | undefined;
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
          throw new Error(
            "This browser cannot record audio. Please type your idea instead.",
          );
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        ownedStream = stream;
        if (generation.current !== current) {
          stream.getTracks().forEach((t) => t.stop());
          releaseAudio();
          return;
        }
        media.current = stream;
        pendingPermission.current = false;
        const mimeType = [
          "audio/webm;codecs=opus",
          "audio/mp4",
          "audio/webm",
        ].find((m) => MediaRecorder.isTypeSupported(m));
        const r = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined,
        );
        recorder.current = r;
        const chunks: Blob[] = [];
        r.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        r.onstop = async () => {
          if (generation.current !== current) {
            stream.getTracks().forEach((track) => track.stop());
            releaseAudio();
            return;
          }
          stopMeter.current();
          clearTimeout(timeout.current);
          stream.getTracks().forEach((t) => t.stop());
          releaseAudio();
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
        try {
          if (autoStop && window.AudioContext) {
            const context = new AudioContext();
            void context.resume().catch(() => {});
            const source = context.createMediaStreamSource(stream);
            const analyser = context.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            const samples = new Float32Array(analyser.fftSize);
            const turn = new SpeechTurn(Date.now());
            const timer = setInterval(() => {
              analyser.getFloatTimeDomainData(samples);
              const level = Math.sqrt(
                samples.reduce((sum, value) => sum + value * value, 0) /
                  samples.length,
              );
              const result = turn.sample(level, Date.now());
              if (result === "send" && r.state === "recording") r.stop();
              if (result === "empty") {
                cancel();
                callbacks.current.onError(
                  "I didn’t hear an answer. Tap the microphone to try again, or choose an option.",
                );
              }
            }, 100);
            stopMeter.current = () => {
              clearInterval(timer);
              source.disconnect();
              void context.close().catch(() => {});
              stopMeter.current = () => {};
            };
          }
        } catch {
          /* Recording still supports tap-to-send if metering is unavailable. */
        }
        setRecording(true);
        setRequesting(false);
        timeout.current = setTimeout(() => {
          if (r.state === "recording") r.stop();
        }, 30000);
      } catch (e) {
        ownedStream?.getTracks().forEach((track) => track.stop());
        releaseAudio();
        if (generation.current === current) {
          pendingPermission.current = false;
          media.current = null;
          setRecording(false);
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
    },
    [accessCode, cancel],
  );
  useEffect(() => () => cancel(), [cancel]);
  return { recording, transcribing, requesting, toggle, cancel };
}
