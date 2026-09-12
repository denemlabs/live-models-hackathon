import { useCallback, useEffect, useRef, useState } from "react";
import type { Reactor } from "@reactor-team/js-sdk";
import { api } from "./api";
import { PictureGate } from "./pictureGate";
import {
  checkedCommand,
  scenePrompt,
  ORBIS_TRACKS,
  orbisFailure,
  modelMessage,
  startOrbisRun,
  type OrbisTransport,
} from "./orbisProtocol";

function transportFor(reactor: Reactor): OrbisTransport {
  return {
    sendCommand: (command, data) => reactor.sendCommand(command, data),
    onMessage: (listener) => {
      reactor.on("message", listener);
      return () => reactor.off("message", listener);
    },
  };
}

export function useOrbis(accessCode: string) {
  const client = useRef<Reactor | null>(null);
  const savedStream = useRef<MediaStream | null>(null);
  const epoch = useRef(0);
  const pending = useRef({ full: "", change: "" });
  const connecting = useRef(false);
  const started = useRef(false);
  const controller = useRef(new AbortController());
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState("Illustrated preview");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [promptStatus, setPromptStatus] = useState("");
  const commandQueue = useRef(Promise.resolve());
  const teardown = useRef(Promise.resolve());
  const lease = useRef<string | null>(null);
  const stage = useRef("session preparation");
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [stageStarted, setStageStarted] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const progress = useCallback((label: string, name: string) => {
    stage.current = name;
    setStatus(label);
    setStageStarted(Date.now());
    setElapsed(0);
  }, []);
  useEffect(() => {
    if (stageStarted === null) return;
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - stageStarted) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [stageStarted]);
  const pictures = useRef(new PictureGate());
  const currentStream = useRef<MediaStream | null>(null);
  const frameTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const waitForPicture = useCallback(() => pictures.current.wait(), []);
  const pictureReady = useCallback((media: MediaStream) => {
    if (currentStream.current !== media) return;
    clearTimeout(frameTimer.current);
    pictures.current.ready();
    setReady(true);
    setStageStarted(null);
    setStatus("Live pictures");
  }, []);
  const stop = useCallback(() => {
    pictures.current.cancel();
    setReady(false);
    currentStream.current = null;
    clearTimeout(idleTimer.current);
    clearTimeout(frameTimer.current);
    setStageStarted(null);
    epoch.current++;
    controller.current.abort();
    controller.current = new AbortController();
    connecting.current = false;
    started.current = false;
    pending.current = { full: "", change: "" };
    commandQueue.current = Promise.resolve();
    const old = client.current;
    client.current = null;
    savedStream.current = null;
    setStream(null);
    setStatus("Illustrated preview");
    setError("");
    setPromptStatus("");
    const oldLease = lease.current;
    lease.current = null;
    // Send cleanup immediately, including during pagehide. The backend owns
    // the session and retains the cleanup handle even if the browser disappears.
    const releaseRequest = oldLease
      ? fetch("/api/reactor/session/release", {
          method: "POST",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            ...(accessCode ? { "x-access-code": accessCode } : {}),
          },
          body: JSON.stringify({ leaseId: oldLease }),
        }).catch(() => {})
      : Promise.resolve();
    // Backend release owns the quota. Slow WebRTC detachment must not add
    // another wait after Reactor has already confirmed the old session closed.
    void old?.disconnect().catch(() => {});
    teardown.current = teardown.current.then(async () => {
      await releaseRequest;
    });
  }, [accessCode]);
  const fail = useCallback(
    (cause?: unknown) => {
      const failure = orbisFailure(cause, stage.current);
      // Never log prompts, tokens, or raw provider bodies.
      console.warn("Orbis connection failed", {
        code: failure.code,
        stage: stage.current,
      });
      stop();
      setError(failure.message);
      setStatus(failure.status);
    },
    [stop],
  );

  const steer = useCallback(
    async (prompt: string, visualChange = "") => {
      clearTimeout(idleTimer.current);
      const scene = { full: prompt, change: visualChange };
      pending.current = scene;
      setPromptStatus(
        prompt
          ? connecting.current
            ? "Your picture is queued while the video connects…"
            : "Sending your picture request…"
          : "",
      );
      if (connecting.current) return pictures.current.wait();
      const generation = epoch.current;
      const currentSession = () => epoch.current === generation;
      const signal = controller.current.signal;
      const acknowledged = (applied: typeof scene) => {
        if (currentSession() && pending.current === applied && applied.full)
          setPromptStatus(
            "Picture request delivered. If it still looks wrong, try Regenerate picture.",
          );
      };
      if (client.current && !prompt) return;
      if (client.current) {
        if (!started.current) {
          pictures.current.begin();
          setReady(false);
        }
        const current = client.current;
        commandQueue.current = commandQueue.current
          .then(async () => {
            if (!currentSession() || client.current !== current) return;
            if (!started.current) {
              progress("Starting the first picture…", "generation start");
              await startOrbisRun(
                transportFor(current),
                scenePrompt(prompt, visualChange),
                signal,
              );
              if (currentSession()) {
                started.current = true;
                if (savedStream.current) {
                  currentStream.current = new MediaStream(
                    savedStream.current.getTracks(),
                  );
                  setStream(currentStream.current);
                }
                progress(
                  "Waiting for the first living picture…",
                  "first video frame",
                );
                const timeout = setTimeout(() => {
                  if (currentSession()) fail({ code: "FIRST_FRAME_TIMEOUT" });
                }, 90000);
                frameTimer.current = timeout;
                void pictures.current.wait().then(() => clearTimeout(timeout));
              }
            } else {
              stage.current = "prompt update";
              await checkedCommand(
                transportFor(current),
                "set_prompt",
                { prompt: scenePrompt(prompt, visualChange) },
                "prompt_accepted",
                signal,
              );
            }
            acknowledged(scene);
          })
          .catch((cause) => {
            if (currentSession()) fail(cause);
          });
        await commandQueue.current;
        return currentSession() ? pictures.current.wait() : false;
      }
      pictures.current.begin();
      setReady(false);
      connecting.current = true;
      setError("");
      progress("Preparing the video connection…", "session preparation");
      try {
        await teardown.current;
        if (!currentSession()) return;
        progress("Reserving your video session…", "session allocation");
        // Attach a rejection handler immediately while allocation is in flight.
        const sdk = import("@reactor-team/js-sdk").then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
        const token = await api<{
          leaseId: string;
          sessionId: string;
          jwt: string;
          model: string;
          provider: "primary" | "backup";
        }>(
          "/api/reactor/session",
          {},
          accessCode,
          AbortSignal.any([signal, AbortSignal.timeout(180000)]),
        );
        if (!currentSession()) {
          await api(
            "/api/reactor/session/release",
            { leaseId: token.leaseId },
            accessCode,
          );
          return;
        }
        lease.current = token.leaseId;
        progress("Loading the video player…", "player loading");
        const loaded = await sdk;
        if ("error" in loaded) throw loaded.error;
        const { Reactor } = loaded.value;
        signal.throwIfAborted();
        const provider = token.provider;
        const reactor = new Reactor({
          modelName: token.model,
          apiUrl: "https://api.reactor.inc",
          logLevel: "off",
          readyTimeoutMs: 240000,
          controlRequestTimeoutMs: 30000,
          modelTracks: [...ORBIS_TRACKS],
        });
        client.current = reactor;
        let establishing = true;
        const currentAttempt = () =>
          currentSession() && client.current === reactor;
        reactor.on("trackReceived", (name, _track, media) => {
          if (currentAttempt() && name === "main_video") {
            savedStream.current = media;
            if (started.current && pending.current.full) {
              currentStream.current = new MediaStream(media.getTracks());
              setStream(currentStream.current);
            }
          }
        });
        reactor.on("error", (cause) => {
          if (currentAttempt() && !establishing) fail(cause);
        });
        reactor.on("message", (raw) => {
          if (!currentAttempt()) return;
          const message = modelMessage(raw);
          switch (message.type) {
            case "command_error":
              fail({ code: "MODEL_COMMAND_REJECTED" });
              break;
            case "generation_started":
              started.current = true;
              setStatus("Waiting for the first living picture…");
              break;
            case "generation_complete":
            case "generation_reset":
              started.current = false;
              setStatus("Ready for the next scene");
              break;
            case "generation_paused":
              setStatus("Pictures paused");
              break;
            case "generation_resumed":
              setStatus(
                provider === "backup"
                  ? "Live pictures · backup"
                  : "Live pictures",
              );
              break;
            case "chunk_complete":
              if (
                typeof message.frames_emitted === "number" &&
                message.frames_emitted > 0
              ) {
                setStatus(
                  provider === "backup"
                    ? "Live pictures · backup"
                    : "Live pictures",
                );
              }
              break;
            case "state":
              if (typeof message.started === "boolean")
                started.current = message.started;
              break;
          }
        });
        reactor.on("statusChanged", (state) => {
          if (!currentAttempt()) return;
          if (establishing && state === "connecting")
            progress("Attaching to your video session…", "session attachment");
          if (establishing && state === "waiting")
            progress(
              "Waiting for Orbis and its video connection…",
              "Orbis startup / WebRTC",
            );
          if (!establishing && state === "disconnected") fail();
        });

        progress("Connecting to Orbis…", "Orbis startup / WebRTC");
        await reactor.connect(token.jwt, { sessionId: token.sessionId });
        console.info("Orbis connection timing", reactor.getConnectionTimings());
        establishing = false;
        signal.throwIfAborted();
        if (!currentSession()) return;
        const initialPrompt = pending.current;
        if (!initialPrompt.full) {
          setStatus("Video ready for your story");
          setStageStarted(null);
          return;
        }
        progress("Starting the first picture…", "generation start");
        await startOrbisRun(
          transportFor(reactor),
          scenePrompt(initialPrompt.full, initialPrompt.change),
          signal,
        );
        if (!currentSession()) return;
        started.current = true;
        if (savedStream.current) {
          currentStream.current = new MediaStream(
            savedStream.current.getTracks(),
          );
          setStream(currentStream.current);
        }
        progress("Waiting for the first living picture…", "first video frame");
        const timeout = setTimeout(() => {
          if (currentAttempt()) fail({ code: "FIRST_FRAME_TIMEOUT" });
        }, 90000);
        frameTimer.current = timeout;
        void pictures.current.wait().then(() => clearTimeout(timeout));
        acknowledged(initialPrompt);
        // A second story page can arrive while the initial prompt is being prepared.
        // Startup can coalesce several turns, so use the latest complete scene here.
        // Every replacement retains the full scene and the current action.
        let applied = initialPrompt;
        while (currentSession() && pending.current !== applied) {
          applied = pending.current;
          await checkedCommand(
            transportFor(reactor),
            "set_prompt",
            { prompt: scenePrompt(applied.full, applied.change) },
            "prompt_accepted",
            signal,
          );
          acknowledged(applied);
        }
      } catch (cause) {
        if (currentSession()) fail(cause);
      } finally {
        if (currentSession()) connecting.current = false;
      }
      return currentSession() ? pictures.current.wait() : false;
    },
    [accessCode, fail, progress],
  );

  // Connecting does not generate anything or send the child's unmoderated input.
  const prepare = useCallback(() => steer(""), [steer]);
  const resetStory = useCallback(() => {
    if (connecting.current || !client.current) {
      stop();
      return;
    }
    const current = client.current;
    const generation = epoch.current;
    pending.current = { full: "", change: "" };
    pictures.current.cancel();
    setReady(false);
    currentStream.current = null;
    clearTimeout(frameTimer.current);
    setStream(null);
    setPromptStatus("");
    setStageStarted(null);
    started.current = false;
    commandQueue.current = commandQueue.current
      .then(async () => {
        if (generation !== epoch.current) return;
        await checkedCommand(
          transportFor(current),
          "reset",
          {},
          "generation_reset",
          controller.current.signal,
        );
        // A state event from the previous run may have arrived while reset
        // was in flight. The next queued scene must still execute start.
        if (generation === epoch.current) started.current = false;
      })
      .catch((cause) => {
        if (generation === epoch.current) fail(cause);
      });
    // Keep the single connected session briefly; release it if no story follows.
    idleTimer.current = setTimeout(stop, 120000);
  }, [fail, stop]);

  const pause = useCallback(
    async (paused: boolean) => {
      const current = client.current;
      const generation = epoch.current;
      if (!current || connecting.current || !started.current) return;
      try {
        await checkedCommand(
          transportFor(current),
          paused ? "pause" : "resume",
          {},
          paused ? "generation_paused" : "generation_resumed",
          controller.current.signal,
        );
      } catch (cause) {
        if (epoch.current === generation) fail(cause);
      }
    },
    [fail],
  );
  useEffect(() => {
    let checking = false;
    const timer = window.setInterval(async () => {
      const id = lease.current;
      if (!id || checking) return;
      checking = true;
      try {
        const result = await api<{ active: boolean }>(
          "/api/reactor/session/heartbeat",
          { leaseId: id },
          accessCode,
        );
        if (lease.current === id && !result.active) {
          stop();
          setStatus("Video moved to the newer story");
          setError(
            "A newer story took over the live video. Reconnect here if you want this story to take over again.",
          );
        }
      } catch {
        /* The persistent server lease and runtime cap handle disconnects. */
      } finally {
        checking = false;
      }
    }, 20000);
    return () => window.clearInterval(timer);
  }, [accessCode, stop]);
  useEffect(() => {
    const hide = () => stop();
    window.addEventListener("pagehide", hide);
    return () => {
      window.removeEventListener("pagehide", hide);
      stop();
    };
  }, [stop]);
  return {
    stream,
    status: stageStarted === null ? status : `${status} (${elapsed}s)`,
    error,
    promptStatus,
    steer,
    prepare,
    resetStory,
    pause,
    stop,
    waitForPicture,
    pictureReady,
    ready,
  };
}
