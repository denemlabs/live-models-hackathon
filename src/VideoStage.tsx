import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { onFirstFrame, stagePhase } from "./mediaLifecycle";
import { welcomeMedia } from "./welcomeMedia";

const nativePlay = (video: HTMLVideoElement) => video.play();

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

type Props = {
  stream: MediaStream | null;
  connecting: boolean;
  paused: boolean;
  reducedMotion: boolean;
  onLiveChange: (ready: boolean) => void;
  storyActive?: boolean;
  media?: typeof welcomeMedia;
  attemptPlay?: (video: HTMLVideoElement) => Promise<void>;
};

export default function VideoStage({
  stream,
  connecting,
  paused,
  reducedMotion,
  onLiveChange,
  storyActive = false,
  media = welcomeMedia,
  attemptPlay = nativePlay,
}: Props) {
  // Choose one encoded asset for this visit; rotation uses object-fit instead of
  // replacing the active source and risking an empty frame mid-transition.
  const [mobile] = useState(
    () => window.matchMedia("(max-width: 600px)").matches,
  );
  const intro = useRef<HTMLVideoElement>(null);
  const ambient = useRef<HTMLVideoElement>(null);
  const live = useRef<HTMLVideoElement>(null);
  const [opened, setOpened] = useState(!media.intro);
  const [introReady, setIntroReady] = useState(false);
  const [ambientReady, setAmbientReady] = useState(false);
  const [liveReady, setLiveReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [playAttempt, setPlayAttempt] = useState(0);
  const still = reducedMotion && !motionAllowed;
  const playing = !paused && !still;
  const phase = stagePhase({ paused, live: liveReady, connecting, opened });

  useEffect(() => {
    setMotionAllowed(false);
  }, [reducedMotion]);
  useEffect(() => {
    const video = live.current;
    if (!video) return;
    setLiveReady(false);
    onLiveChange(false);
    video.srcObject = stream;
    const cancel = stream
      ? onFirstFrame(video, () => {
          setOpened(true);
          setLiveReady(true);
          onLiveChange(true);
          setBlocked(false);
        })
      : () => {};
    return () => {
      cancel();
      video.pause();
      video.srcObject = null;
    };
  }, [stream, onLiveChange]);

  useEffect(() => {
    let active = true;
    const cancellations: (() => void)[] = [];
    const play = (
      video: HTMLVideoElement | null,
      enabled: boolean,
      ready?: () => void,
    ) => {
      if (!video) return;
      if (!playing || !enabled) {
        video.pause();
        return;
      }
      if (ready) cancellations.push(onFirstFrame(video, ready));
      void attemptPlay(video).catch(() => {
        if (active) setBlocked(true);
      });
    };
    play(intro.current, !opened && !liveReady && !storyActive, () => {
      setIntroReady(true);
      setBlocked(false);
    });
    // Keep a decoded forest underneath live playback, including early starts.
    // Disconnecting must never bring the opening book back or expose black video.
    play(ambient.current, opened && !storyActive, () => {
      setAmbientReady(true);
      setBlocked(false);
    });
    play(live.current, !!stream);
    return () => {
      active = false;
      cancellations.forEach((cancel) => cancel());
    };
  }, [
    playing,
    opened,
    liveReady,
    stream,
    mobile,
    playAttempt,
    attemptPlay,
    storyActive,
  ]);

  // Keep a decoded intro frame under the ambient layer until the latter is ready.
  // Likewise the local background stays mounted under the live stream at all times.
  const variant = mobile ? "mobile" : "desktop";
  return (
    <div
      className={`video-stage ${storyActive && !liveReady ? "is-story-waiting" : ""}`}
      data-phase={phase}
      data-live-ready={liveReady}
      aria-hidden={false}
    >
      <img
        className="stage-poster"
        src={mobile && media.mobilePoster ? media.mobilePoster : media.poster}
        alt=""
        fetchPriority="high"
      />
      {media.intro && (
        <video
          ref={intro}
          className={`stage-layer ${introReady && !ambientReady ? "is-visible" : ""}`}
          src={media.intro[variant]}
          muted
          playsInline
          preload="auto"
          onEnded={() => setOpened(true)}
          onError={() => {
            setMediaFailed(true);
            setOpened(true);
          }}
          aria-hidden="true"
        />
      )}
      {media.ambient && (
        <video
          ref={ambient}
          className={`stage-layer ${opened && ambientReady ? "is-visible" : ""}`}
          src={media.ambient[variant]}
          muted
          loop
          playsInline
          preload="auto"
          onError={() => setMediaFailed(true)}
          aria-hidden="true"
        />
      )}
      <video
        ref={live}
        className={`stage-layer live-layer ${stream && liveReady ? "is-visible" : ""}`}
        muted
        playsInline
        aria-hidden="true"
      />
      <div className="stage-shade" />
      {(blocked || still) &&
        !paused &&
        (!!stream || !!media.intro || !!media.ambient) && (
          <button
            className="background-play float-surface"
            onClick={() => {
              setMotionAllowed(true);
              setBlocked(false);
              setPlayAttempt((n) => n + 1);
            }}
          >
            <Play size={18} /> Play background
          </button>
        )}
      {mediaFailed && (
        <span className="media-note">
          Background video unavailable · still scene
        </span>
      )}
    </div>
  );
}
