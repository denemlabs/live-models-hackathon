import { useCallback, useEffect, useRef, useState } from "react";
import type { Reactor } from "@reactor-team/js-sdk";
import { api } from "./api";
import { acquireVideoSlot } from "./videoSlot";
import {
  checkedCommand,
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
  const epoch = useRef(0);
  const pending = useRef({ full: "", change: "" });
  const connecting = useRef(false);
  const started = useRef(false);
  const controller = useRef(new AbortController());
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState("Illustrated preview");
  const [error, setError] = useState("");
  const commandQueue = useRef(Promise.resolve());
  const teardown = useRef(Promise.resolve());
  const releaseSlot = useRef<(() => void) | null>(null);
  const stop = useCallback(() => {
    epoch.current++;
    controller.current.abort();
    controller.current = new AbortController();
    connecting.current = false;
    started.current = false;
    pending.current = { full: "", change: "" };
    commandQueue.current = Promise.resolve();
    const old = client.current;
    client.current = null;
    setStream(null);
    setStatus("Illustrated preview");
    setError("");
    const release = releaseSlot.current;
    releaseSlot.current = null;
    // Hold the cross-tab slot until Reactor has finished closing the old session.
    teardown.current = teardown.current
      .then(async () => {
        try {
          await old?.disconnect();
        } finally {
          release?.();
        }
      })
      .catch(() => {});
  }, []);
  const fail = useCallback(
    (cause?: unknown) => {
      const failure = orbisFailure(cause);
      // Never log prompts, tokens, or raw provider bodies.
      console.warn("Orbis connection failed", failure.code);
      stop();
      setError(failure.message);
      setStatus(failure.status);
    },
    [stop],
  );

  const steer = useCallback(
    async (prompt: string, visualChange = "") => {
      pending.current = { full: prompt, change: visualChange };
      if (connecting.current) return;
      const generation = epoch.current;
      const currentSession = () => epoch.current === generation;
      const signal = controller.current.signal;
      if (client.current) {
        const current = client.current;
        commandQueue.current = commandQueue.current
          .then(async () => {
            if (!currentSession() || client.current !== current) return;
            if (!started.current) {
              await startOrbisRun(transportFor(current), prompt, signal);
              if (currentSession()) started.current = true;
            } else {
              await checkedCommand(
                transportFor(current),
                "set_prompt",
                { prompt: visualChange.trim() || prompt },
                "prompt_accepted",
                signal,
              );
            }
          })
          .catch((cause) => {
            if (currentSession()) fail(cause);
          });
        await commandQueue.current;
        return;
      }
      connecting.current = true;
      setError("");
      setStatus("Waking up your living world…");
      try {
        await teardown.current;
        if (!currentSession()) return;
        if (navigator.locks) {
          const release = await acquireVideoSlot(navigator.locks);
          if (!currentSession()) {
            release();
            return;
          }
          releaseSlot.current = release;
        }
        const { jwt, model } = await api<{ jwt: string; model: string }>(
          "/api/reactor/token",
          {},
          accessCode,
          AbortSignal.any([signal, AbortSignal.timeout(20000)]),
        );
        if (!currentSession()) return;
        const { Reactor } = await import("@reactor-team/js-sdk");
        if (!currentSession()) return;
        const reactor = new Reactor({
          modelName: model,
          apiUrl: "https://api.reactor.inc",
          logLevel: "off",
          readyTimeoutMs: 240000,
          modelTracks: [...ORBIS_TRACKS],
        });
        client.current = reactor;
        reactor.on("trackReceived", (name, _track, media) => {
          if (currentSession() && name === "main_video") setStream(media);
        });
        reactor.on("error", (cause) => {
          if (currentSession()) fail(cause);
        });
        reactor.on("message", (raw) => {
          if (!currentSession()) return;
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
              setStatus("Live pictures");
              break;
            case "chunk_complete":
              if (
                typeof message.frames_emitted === "number" &&
                message.frames_emitted > 0
              )
                setStatus("Live pictures");
              break;
            case "state":
              if (typeof message.started === "boolean")
                started.current = message.started;
              break;
          }
        });
        reactor.on("statusChanged", (state) => {
          if (currentSession() && state === "disconnected") fail();
        });
        await reactor.connect(jwt);
        if (!currentSession()) return;
        const initialPrompt = pending.current;
        setStatus("Waiting for the first living picture…");
        await startOrbisRun(transportFor(reactor), initialPrompt.full, signal);
        if (!currentSession()) return;
        started.current = true;
        // A second story page can arrive while the initial prompt is being prepared.
        // Startup can coalesce several turns, so use the latest complete scene here.
        // Once connected, ordinary updates use only the visible transition.
        let applied = initialPrompt;
        while (currentSession() && pending.current !== applied) {
          applied = pending.current;
          await checkedCommand(
            transportFor(reactor),
            "set_prompt",
            { prompt: applied.full },
            "prompt_accepted",
            signal,
          );
        }
      } catch (cause) {
        if (currentSession()) fail(cause);
      } finally {
        if (currentSession()) connecting.current = false;
      }
    },
    [accessCode, fail],
  );

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
    const hide = () => stop();
    window.addEventListener("pagehide", hide);
    return () => {
      window.removeEventListener("pagehide", hide);
      stop();
    };
  }, [stop]);
  return { stream, status, error, steer, pause, stop };
}
