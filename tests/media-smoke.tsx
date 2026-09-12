// Development-only manual harness; not imported by the application or built into dist.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import VideoStage from "../src/VideoStage";
import { useMicrophone } from "../src/useMicrophone";
import "../src/styles.css";
import "../src/wonderbook.css";

const media = {
  poster: "/story-previews/02-singing-forest.png",
  intro: {
    desktop: "/tests/fixtures/intro.mp4",
    mobile: "/tests/fixtures/intro.mp4",
  },
  ambient: {
    desktop: "/tests/fixtures/ambient.mp4",
    mobile: "/tests/fixtures/ambient.mp4",
  },
};
function Smoke() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [ready, setReady] = useState(false);
  const [run, setRun] = useState(0);
  const [micError, setMicError] = useState("");
  const mic = useMicrophone("", () => {}, setMicError);
  const blockedPlay = useRef(false);
  const attemptPlay = useCallback(
    (video: HTMLVideoElement) =>
      blockedPlay.current
        ? Promise.reject(
            new DOMException("QA autoplay block", "NotAllowedError"),
          )
        : video.play(),
    [],
  );
  const frameLoop = useRef(0);
  const currentStream = useRef<MediaStream | null>(null);
  const stop = () => {
    cancelAnimationFrame(frameLoop.current);
    currentStream.current?.getTracks().forEach((t) => t.stop());
    currentStream.current = null;
    setStream(null);
    setConnecting(false);
  };
  useEffect(
    () => () => {
      cancelAnimationFrame(frameLoop.current);
      currentStream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  const firstFrame = () => {
    stop();
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d")!;
    const draw = () => {
      ctx.fillStyle = "#c18e47";
      ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = "#102919";
      ctx.font = "28px sans-serif";
      ctx.fillText("SYNTHETIC LIVE TEST FRAME", 75, 180);
      frameLoop.current = requestAnimationFrame(draw);
    };
    draw();
    currentStream.current = canvas.captureStream(12);
    setStream(currentStream.current);
  };
  return (
    <div className="immersive-app">
      <VideoStage
        key={run}
        media={media}
        attemptPlay={attemptPlay}
        stream={stream}
        paused={paused}
        reducedMotion={reduced}
        connecting={connecting}
        onLiveChange={setReady}
      />
      <div
        style={{
          position: "absolute",
          zIndex: 5,
          top: 20,
          left: 20,
          right: 20,
          padding: 14,
          background: "#fff",
          color: "#143522",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <strong>
          QA fixtures only · {ready ? "frame ready" : "no live frame"}
        </strong>
        <button
          onClick={() => {
            stop();
            setRun((n) => n + 1);
          }}
        >
          Restart intro
        </button>
        <button
          onClick={() => {
            stop();
            setStream(new MediaStream());
            setConnecting(true);
          }}
        >
          Connect without frames
        </button>
        <button onClick={firstFrame}>Deliver first frame</button>
        <button onClick={stop}>Disconnect / error</button>
        <button onClick={() => setPaused(!paused)}>
          {paused ? "Resume" : "Pause"}
        </button>
        <button onClick={() => setReduced(!reduced)}>
          Toggle reduced motion
        </button>
        <button
          onClick={() => {
            stop();
            setReduced(false);
            setPaused(false);
            blockedPlay.current = true;
            setRun((n) => n + 1);
          }}
        >
          Simulate blocked autoplay
        </button>
        <button
          onClick={() => {
            blockedPlay.current = false;
          }}
        >
          Allow playback
        </button>
        <button
          onClick={async () => {
            const original = navigator.mediaDevices.getUserMedia;
            navigator.mediaDevices.getUserMedia = () =>
              Promise.reject(
                new DOMException("QA permission declined", "NotAllowedError"),
              );
            try {
              await mic.toggle();
            } finally {
              navigator.mediaDevices.getUserMedia = original;
            }
          }}
        >
          Simulate microphone denial
        </button>
        <span role="status">{micError}</span>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Smoke />
  </React.StrictMode>,
);
