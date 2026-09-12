import { useEffect, useRef, useState } from "react";
import { ConversationProvider } from "@elevenlabs/react";
import {
  ArrowRight,
  BookOpen,
  Captions,
  Feather,
  LoaderCircle,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { Profile, StoryPage } from "../shared/story";
import type { SceneArgs } from "../shared/storyteller";
import Illustration from "./Illustration";
import { useStoryteller } from "./useStoryteller";
import { usePictureFrame } from "./usePictureFrame";

type Props = {
  accessCode: string;
  profile: Profile;
  topic: string;
  history: StoryPage[];
  stream: MediaStream | null;
  pictureStatus: string;
  pictureError: string;
  onPictureReady: (stream: MediaStream) => void;
  preparePictures: () => Promise<boolean>;
  livePictures: boolean;
  onScene: (scene: SceneArgs) => void;
  onPage: (page: StoryPage) => void;
  onLeave: () => void;
};

export default function StoryCall(props: Props) {
  return (
    <ConversationProvider>
      <CallRoom {...props} />
    </ConversationProvider>
  );
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function CallRoom({
  accessCode,
  profile,
  topic,
  history,
  stream,
  pictureStatus,
  pictureError,
  onPictureReady,
  preparePictures,
  livePictures,
  onScene,
  onPage,
  onLeave,
}: Props) {
  const [pages, setPages] = useState<StoryPage[]>([]);
  const [theme, setTheme] = useState<StoryPage["theme"]>(
    history.at(-1)?.theme ?? "forest",
  );
  const [typed, setTyped] = useState("");
  const [showCaptions, setShowCaptions] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const orb = useRef<HTMLDivElement>(null);

  const call = useStoryteller({
    accessCode,
    profile,
    topic,
    history,
    preparePictures,
    onScene: (scene) => {
      setTheme(scene.theme);
      onScene(scene);
    },
    onPage: (page) => {
      setPages((prev) => [...prev, page]);
      onPage(page);
    },
  });
  const live = call.status === "connected";
  const page = pages.at(-1);

  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  usePictureFrame(video, stream, onPictureReady);
  useEffect(() => {
    if (pictureError && live) call.hangUp();
  }, [pictureError, live, call.hangUp]);
  useEffect(() => {
    if (!live) return setSeconds(0);
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [live]);

  const { getOutputByteFrequencyData } = call;
  useEffect(() => {
    if (!live || profile.reducedMotion) return;
    let frame = 0;
    const paint = () => {
      frame = requestAnimationFrame(paint);
      const data = getOutputByteFrequencyData();
      if (!data?.length || !orb.current) return;
      let sum = 0;
      for (const value of data) sum += value;
      const level = Math.min(1, sum / data.length / 90);
      orb.current.style.setProperty("--level", level.toFixed(3));
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [live, profile.reducedMotion, getOutputByteFrequencyData]);

  function send(event: React.FormEvent) {
    event.preventDefault();
    const words = typed.trim();
    if (!words || !live) return;
    call.sendUserMessage(words);
    setTyped("");
  }
  function leave() {
    call.hangUp();
    onLeave();
  }

  return (
    <div
      className={`call ${live ? "connected" : ""} ${profile.reducedMotion ? "reduced-motion" : ""}`}
      role="dialog"
      aria-label="Story call with the storyteller"
      aria-modal="true"
    >
      <div className="call-top">
        <span className="call-badge">
          <span className={live ? "call-dot live" : "call-dot"} />
          {live ? "Story call" : "Not connected"}
          {live && <em>{clock(seconds)}</em>}
        </span>
        <button className="call-close" onClick={leave} aria-label="Leave call">
          <X size={20} />
        </button>
      </div>

      <div className="call-stage">
        <div className="call-window">
          <Illustration theme={theme} />
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            className={stream ? "live-video visible" : "live-video"}
          />
          <span className="picture-label">
            <span />
            {livePictures ? pictureStatus : "Illustrated scene"}
          </span>
          <div
            ref={orb}
            className={`teller-orb ${call.isSpeaking ? "speaking" : ""}`}
          >
            <span className="teller-ring" />
            <span className="teller-face">
              <Sparkles size={26} />
            </span>
            <small>
              {call.isSpeaking
                ? "Telling the story…"
                : live
                  ? "Listening to you…"
                  : "Waiting"}
            </small>
          </div>
        </div>

        {live && showCaptions && (
          <div className="call-captions" aria-live="polite">
            {call.captions.length ? (
              call.captions.slice(-3).map((caption) => (
                <p key={caption.id} className={caption.who}>
                  <span>
                    {caption.who === "storyteller" ? "Storyteller" : "You"}
                  </span>
                  {caption.text}
                </p>
              ))
            ) : (
              <p className="storyteller">
                <span>Storyteller</span>Say hello whenever you’re ready.
              </p>
            )}
          </div>
        )}
      </div>

      {!live ? (
        <div className="call-lobby">
          <span className="section-label">A STORY, TOLD JUST FOR YOU</span>
          <h2>
            {history.length
              ? "Shall we pick the story back up?"
              : "Call the storyteller."}
          </h2>
          <p>
            {history.length
              ? "The storyteller remembers where your adventure stopped, and will carry on from there."
              : "Someone is waiting to tell you a story. You can talk out loud, and they’ll listen and answer, just like a real call."}
          </p>
          <button
            className="call-answer"
            onClick={() => void call.start()}
            disabled={call.connecting || call.status === "connecting"}
          >
            {call.connecting || call.status === "connecting" ? (
              <LoaderCircle className="spin" size={22} />
            ) : (
              <Phone size={22} />
            )}
            {call.connecting || call.status === "connecting"
              ? livePictures
                ? "Preparing pictures before the story…"
                : "Ringing…"
              : "Start the story call"}
          </button>
          <p className="tiny-note">
            <ShieldCheck size={14} /> Your voice goes to ElevenLabs while the
            call is running. Nothing is saved here.
          </p>
        </div>
      ) : (
        <>
          {page && (
            <article className="call-page">
              <div className="page-top">
                <span>CHAPTER {String(pages.length).padStart(2, "0")}</span>
                <Feather size={17} />
              </div>
              <h3>{page.title}</h3>
              <p>{page.narrative}</p>
              <div className="call-choices">
                {page.choices.length === 0 && (
                  <div className="open-answer">
                    <p>
                      Your turn. Tell the storyteller your idea, or type it
                      below.
                    </p>
                    <button
                      onClick={() =>
                        call.sendUserMessage(
                          "I’m not sure. Please give me a couple of ideas to choose from.",
                        )
                      }
                    >
                      Give me ideas <Sparkles size={14} />
                    </button>
                  </div>
                )}
                {page.choices.slice(0, 2).map((choice, index) => (
                  <button
                    key={choice}
                    onClick={() => call.sendUserMessage(choice)}
                  >
                    <span className="choice-number">{index + 1}</span> {choice}
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
            </article>
          )}
          <form className="call-type" onSubmit={send}>
            <label className="sr-only" htmlFor="call-message">
              Type to the storyteller
            </label>
            <input
              id="call-message"
              value={typed}
              maxLength={300}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="…or type it instead"
            />
            <button
              aria-label="Send to the storyteller"
              disabled={!typed.trim()}
            >
              <ArrowRight size={18} />
            </button>
          </form>
        </>
      )}

      <div className="call-bar">
        <button
          className={call.isMuted ? "call-control muted" : "call-control"}
          onClick={() => call.setMuted(!call.isMuted)}
          disabled={!live}
          aria-label={call.isMuted ? "Unmute microphone" : "Mute microphone"}
        >
          {call.isMuted ? <MicOff size={21} /> : <Mic size={21} />}
          <small>{call.isMuted ? "Muted" : "Mic on"}</small>
        </button>
        <button
          className={showCaptions ? "call-control on" : "call-control"}
          onClick={() => setShowCaptions((value) => !value)}
          disabled={!live}
          aria-pressed={showCaptions}
          aria-label="Toggle captions"
        >
          <Captions size={21} />
          <small>Captions</small>
        </button>
        <button
          className="call-control book"
          disabled={!pages.length}
          onClick={leave}
          aria-label="Close the call and read the storybook"
        >
          <BookOpen size={21} />
          <small>
            {pages.length
              ? `${pages.length} page${pages.length > 1 ? "s" : ""}`
              : "Storybook"}
          </small>
        </button>
        <button
          className="call-control end"
          onClick={leave}
          aria-label="End the call"
        >
          <PhoneOff size={21} />
          <small>End</small>
        </button>
      </div>

      {call.error && (
        <div className="error-message call-error" role="alert">
          <span>{call.error}</span>
        </div>
      )}
    </div>
  );
}
