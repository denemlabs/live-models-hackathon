import { useCallback, useEffect, useRef, useState } from "react";
import type { Reactor } from "@reactor-team/js-sdk";
import { api } from "./api";

export function useOrbis(accessCode: string) {
  const client = useRef<Reactor | null>(null);
  const epoch = useRef(0);
  const pending = useRef("");
  const connecting = useRef(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState("Illustrated preview");
  const [error, setError] = useState("");
  const commandQueue = useRef(Promise.resolve());
  const stop = useCallback(() => {
    epoch.current++;
    connecting.current = false;
    pending.current = "";
    commandQueue.current = Promise.resolve();
    const old = client.current;
    client.current = null;
    void old?.disconnect().catch(() => {});
    setStream(null);
    setStatus("Illustrated preview");
    setError("");
  }, []);
  const steer = useCallback(
    async (prompt: string) => {
      pending.current = prompt;
      if (connecting.current) return;
      if (client.current) {
        const current = client.current;
        commandQueue.current = commandQueue.current.then(async () => {
          if (client.current === current)
            await current.sendCommand("set_prompt", { prompt });
        });
        await commandQueue.current;
        return;
      }
      const generation = epoch.current;
      const currentSession = () => epoch.current === generation;
      const fail = () => {
        if (!currentSession()) return;
        stop();
        setError(
          "Live pictures couldn’t connect. You can keep reading or reconnect.",
        );
        setStatus("Pictures disconnected");
      };
      connecting.current = true;
      setError("");
      setStatus("Waking up your living world…");
      try {
        const { jwt, model } = await api<{ jwt: string; model: string }>(
          "/api/reactor/token",
          {},
          accessCode,
        );
        if (!currentSession()) return;
        const { Reactor } = await import("@reactor-team/js-sdk");
        if (!currentSession()) return;
        const reactor = new Reactor({
          modelName: model,
          apiUrl: "https://api.reactor.inc",
          logLevel: "off",
          readyTimeoutMs: 240000,
          modelTracks: [
            { name: "main_video", kind: "video", direction: "recvonly" },
          ],
        });
        client.current = reactor;
        reactor.on("trackReceived", (name, _track, media) => {
          if (currentSession() && name === "main_video") {
            setStream(media);
            setStatus("Live pictures");
          }
        });
        reactor.on("error", fail);
        reactor.on("message", (message) => {
          if (message.type === "command_error") fail();
        });
        reactor.on("statusChanged", (state) => {
          if (currentSession() && state === "disconnected") {
            setStream(null);
            setStatus("Pictures disconnected");
          }
        });
        await reactor.connect(jwt);
        if (!currentSession()) {
          void reactor.disconnect().catch(() => {});
          return;
        }
        await reactor.sendCommand("set_audio_enabled", {
          audio_enabled: false,
        });
        if (!currentSession()) return;
        await reactor.sendCommand("set_prompt", { prompt: pending.current });
        if (!currentSession()) return;
        await reactor.sendCommand("start", {});
        if (currentSession())
          setStatus("Waiting for the first living picture…");
      } catch {
        if (currentSession()) {
          setError(
            "Live pictures couldn’t start. You can keep reading or reconnect.",
          );
          setStatus("Pictures disconnected");
          const old = client.current;
          client.current = null;
          void old?.disconnect().catch(() => {});
        }
      } finally {
        if (currentSession()) connecting.current = false;
      }
    },
    [accessCode, stop],
  );
  const pause = useCallback(async (paused: boolean) => {
    if (client.current && !connecting.current)
      await client.current.sendCommand(paused ? "pause" : "resume", {});
  }, []);
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
