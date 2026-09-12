import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  CircleHelp,
  Leaf,
  LoaderCircle,
  Mic,
  Moon,
  Pause,
  Play,
  Settings2,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { ProfileSchema, type Profile, type StoryPage } from "../shared/story";
import VideoStage, { useMediaQuery } from "./VideoStage";
import StoryCaption from "./StoryCaption";
import PreviewSwitcher from "./PreviewSwitcher";
import {
  abortablePreviewDelay,
  previewConfig,
  previewMedia,
  previewPage,
  previewResponse,
  previewStages,
  previewStory,
  type PreviewStage,
} from "./storyPreview";
import { followVisualViewport } from "./visualViewport";
import { welcomeMedia } from "./welcomeMedia";
import { Wordmark } from "./Brand";
import { api } from "./api";
import { useOrbis } from "./useOrbis";
import { useMicrophone } from "./useMicrophone";
import { useNarration } from "./useNarration";

type Config = {
  openai: boolean;
  reactor: boolean;
  elevenlabs: boolean;
  accessCodeRequired: boolean;
};

export default function App({
  designPreview = false,
}: {
  designPreview?: boolean;
}) {
  const [config, setConfig] = useState<Config | null>(
    designPreview ? previewConfig : null,
  );
  const [previewStage, setPreviewStage] = useState<PreviewStage>("story");
  const [demo, setDemo] = useState(true);
  const [profile, setProfile] = useState<Profile>(() =>
    ProfileSchema.parse({}),
  );
  const [input, setInput] = useState("");
  const [topic, setTopic] = useState("");
  const [pages, setPages] = useState<StoryPage[]>(
    designPreview ? [previewStory] : [],
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const [consent, setConsent] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [paused, setPaused] = useState(false);
  const [lastWords, setLastWords] = useState("");
  const bookRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [typing, setTyping] = useState(false);
  const [fullText, setFullText] = useState(false);
  const [sound, setSound] = useState(false);
  const textDialog = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const storyInputRef = useRef<HTMLInputElement>(null);
  const typeButtonRef = useRef<HTMLButtonElement>(null);
  const wasTyping = useRef(false);
  const systemReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const reducedMotion = profile.reducedMotion || systemReducedMotion;
  const request = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);
  const page = pages[pageIndex];
  const orbis = useOrbis(accessCode);
  const inStory = pages.length > 0 || opening;
  const simulating =
    designPreview &&
    ["preparing", "transcribing", "adapting"].includes(previewStage);
  const locked = busy || paused || simulating;
  const { speaking, read, mute } = useNarration({
    elevenlabs: !!config?.elevenlabs && consent && !demo,
    enabled: profile.readAloud,
    accessCode,
    youngReader: profile.age === "3–5",
    onError: setError,
  });

  useEffect(() => {
    if (designPreview) return;
    api<Config>("/api/config")
      .then((c) => {
        setConfig(c);
        setDemo(!c.openai);
      })
      .catch(() =>
        setError(
          "Couldn’t reach the story server. Please refresh to reconnect.",
        ),
      );
  }, [designPreview]);
  useEffect(() => {
    if (settings || help) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [settings, help]);
  useEffect(() => {
    if (fullText) textDialog.current?.showModal();
    else textDialog.current?.close();
  }, [fullText]);
  useLayoutEffect(() => {
    if (viewportRef.current) return followVisualViewport(viewportRef.current);
  }, []);
  useLayoutEffect(() => {
    if (typing) storyInputRef.current?.focus({ preventScroll: true });
    else if (wasTyping.current)
      typeButtonRef.current?.focus({ preventScroll: true });
    wasTyping.current = typing;
  }, [typing]);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );

  async function tell(words: string) {
    if (!words.trim() || busy || paused) return;
    if (!demo && !consent) {
      setSettings(true);
      setError("A grown-up needs to enable live storytelling first.");
      return;
    }
    mute();
    setError("");
    setBusy(true);
    setTyping(false);
    if (designPreview) setPreviewStage(pages.length ? "adapting" : "preparing");
    setLastWords(words);
    const first = !pages.length;
    if (first) {
      setOpening(true);
      setTopic(words);
    }
    const generation = ++requestGeneration.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 100000);
    try {
      const history =
        pages.length > 12 ? [pages[0], ...pages.slice(-11)] : pages;
      let result: { page: StoryPage };
      if (designPreview) {
        await abortablePreviewDelay(controller.signal);
        const next = previewResponse(words);
        result = { page: previewPage(next) };
        setPreviewStage(next);
      } else {
        result = await api<{ page: StoryPage }>(
          "/api/story",
          {
            input: words,
            topic: first ? words : topic,
            history,
            profile,
            demo,
          },
          accessCode,
          controller.signal,
        );
      }
      if (generation !== requestGeneration.current) return;
      setPages((prev) => [...prev, result.page]);
      setPageIndex(pages.length);
      setInput("");
      setTyping(false);
      setOpening(false);
      if (profile.readAloud && sound)
        void read(result.page.narrative + " " + result.page.question, true);
      if (!demo && config?.reactor) void orbis.steer(result.page.visualPrompt);
      requestAnimationFrame(() => {
        if (generation === requestGeneration.current)
          bookRef.current?.focus({ preventScroll: true });
      });
    } catch (e) {
      if (generation === requestGeneration.current) {
        setError(
          e instanceof Error && e.name !== "AbortError"
            ? e.message
            : "That page took too long. Please try again.",
        );
        setOpening(false);
      }
    } finally {
      clearTimeout(timeout);
      if (generation === requestGeneration.current) setBusy(false);
    }
  }

  const mic = useMicrophone(
    accessCode,
    (text) => {
      setInput(text);
      void tell(text);
    },
    setError,
  );
  const micBusy = mic.transcribing || mic.requesting;
  function toggleMic() {
    if (designPreview) {
      if (previewStage === "listening")
        void tell("Make this story gentler and reassuring.");
      else setPreviewStage("listening");
      return;
    }
    if (!config?.openai) {
      setError(
        "Add an OpenAI key to use the microphone. For now, choose Type instead to enter your idea.",
      );
      return;
    }
    if (!consent) {
      setSettings(true);
      setError("A grown-up needs to enable voice sharing first.");
      return;
    }
    mute();
    setError("");
    void mic.toggle();
  }
  function reset() {
    requestGeneration.current++;
    request.current?.abort();
    mic.cancel();
    mute();
    orbis.stop();
    setPages([]);
    setPageIndex(0);
    setOpening(false);
    setBusy(false);
    setPaused(false);
    setInput("");
    setTopic("");
    setError("");
    setLastWords("");
    setFullText(false);
    setTyping(false);
    if (designPreview) setPreviewStage("story");
  }
  function showPreview(stage: PreviewStage) {
    if (!designPreview) return;
    requestGeneration.current++;
    request.current?.abort();
    mute();
    setPreviewStage(stage);
    setPages(stage === "preparing" ? [] : [previewPage(stage)]);
    setPageIndex(0);
    setOpening(stage === "preparing");
    setBusy(false);
    setPaused(false);
    setTyping(false);
    setFullText(false);
    setError("");
    setLastWords(stage === "gentler" ? "Make the story gentler." : "");
  }
  function flip(index: number) {
    mute();
    setPageIndex(index);
    if (profile.readAloud && sound && !paused)
      void read(pages[index].narrative, true);
    if (!demo && config?.reactor && !paused)
      void orbis.steer(pages[index].visualPrompt);
  }
  async function togglePause() {
    const value = !paused;
    setPaused(value);
    mute();
    mic.cancel();
    if (value) {
      requestGeneration.current++;
      request.current?.abort();
      setBusy(false);
      setOpening(false);
    }
    if (value && !liveReady) orbis.stop();
    else if (!value && !demo && config?.reactor && !orbis.stream && page)
      void orbis.steer(page.visualPrompt);
    else await orbis.pause(value);
  }
  const canSubmit =
    input.trim().length > 0 &&
    !locked &&
    !micBusy &&
    !mic.recording &&
    config !== null;

  const isLive = !!orbis.stream && liveReady;
  const connecting = designPreview
    ? previewStage === "connecting"
    : !demo && !!config?.reactor && !!page && !isLive && !orbis.error;
  const previewError =
    designPreview && previewStage === "error"
      ? "The live world couldn’t connect. Your story is still here."
      : "";
  const waitingForStory = !page && (busy || opening || simulating);
  const ending = !!page && /\bThe end[.!]?\s*$/i.test(page.narrative);
  const listening =
    mic.recording || (designPreview && previewStage === "listening");
  const status = designPreview
    ? paused
      ? "Paused"
      : `${previewStages.find(([key]) => key === previewStage)?.[1]} · simulated`
    : paused
      ? "Paused"
      : mic.recording
        ? "Listening…"
        : mic.transcribing
          ? "Transcribing…"
          : mic.requesting
            ? "Opening microphone…"
            : busy
              ? "Preparing your story…"
              : connecting
                ? "Preparing your world…"
                : isLive
                  ? "Live · Orbis"
                  : demo && inStory
                    ? "Sample story · preview scene"
                    : welcomeMedia.intro
                      ? "Welcome to your imagination"
                      : "Preview scene";
  const toggleSound = () => {
    setSound(!sound);
    if (sound) mute();
    else if (page && !paused && profile.readAloud) void read(page.narrative);
  };

  return (
    <div
      ref={viewportRef}
      className={`immersive-app ${inStory ? "is-reading" : ""} ${reducedMotion ? "reduced-motion" : ""} ${profile.largeText ? "large-text" : ""} ${typing ? "is-typing" : ""} ${designPreview ? "is-design-preview" : ""}`}
    >
      <VideoStage
        stream={orbis.stream}
        paused={paused}
        connecting={connecting}
        reducedMotion={reducedMotion}
        onLiveChange={setLiveReady}
        media={designPreview ? previewMedia : welcomeMedia}
      />
      <div className="immersive-controls">
        <header className="immersive-header">
          <button
            className="immersive-brand"
            onClick={reset}
            aria-label="WonderBook home"
          >
            <Wordmark />
          </button>
          <div className="floating-tools float-surface">
            <button
              aria-label={paused ? "Resume experience" : "Pause experience"}
              aria-pressed={paused}
              onClick={() => void togglePause()}
            >
              {paused ? <Play size={20} /> : <Pause size={20} />}
            </button>
            <button
              aria-label={sound ? "Mute narration" : "Enable narration"}
              aria-pressed={sound}
              onClick={toggleSound}
            >
              {sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            <span className="tool-divider" />
            <button
              aria-label="Grown-up settings"
              onClick={() => setSettings(true)}
            >
              <Settings2 size={20} />
            </button>
          </div>
        </header>
        <main
          className="immersive-main"
          ref={bookRef}
          tabIndex={-1}
          aria-label={page ? page.title : "Enter your story"}
        >
          {designPreview ? (
            <PreviewSwitcher
              stage={previewStage}
              status={status}
              onChange={showPreview}
            />
          ) : (
            <div className="world-status float-surface" role="status">
              <span
                className={
                  isLive && !paused ? "live-indicator" : "ambient-indicator"
                }
              />
              {status}
            </div>
          )}
          {inStory && (
            <button className="exit-story float-surface" onClick={reset}>
              <X size={16} /> Exit story
            </button>
          )}
          <div className="story-dock">
            {(busy ||
              simulating ||
              connecting ||
              listening ||
              mic.transcribing) &&
              page && (
                <div className="story-feedback float-surface" role="status">
                  {listening ? (
                    <AudioLines size={16} />
                  ) : (
                    <LoaderCircle className="spin" size={15} />
                  )}
                  {listening
                    ? "Your idea can change this world…"
                    : connecting
                      ? "Your story is ready. Opening its world…"
                      : mic.transcribing ||
                          (previewStage === "transcribing" && designPreview)
                        ? "Turning a little voice into words…"
                        : "We’re making room for your idea…"}
                </div>
              )}
            {page && (
              <StoryCaption
                key={pageIndex + page.narrative}
                text={page.narrative}
                preview={designPreview}
                hidden={typing}
                paused={
                  paused ||
                  busy ||
                  simulating ||
                  connecting ||
                  listening ||
                  typing ||
                  fullText ||
                  settings ||
                  help
                }
                onFullText={() => setFullText(true)}
              />
            )}
            {waitingForStory && (
              <div className="story-arrival" role="status">
                <Sparkles className={paused ? "" : "arrival-spark"} size={28} />
                <span className="welcome-kicker">
                  A LITTLE MAGIC IS ON ITS WAY
                </span>
                <h1>
                  {paused
                    ? "Your world can wait."
                    : "Every adventure starts\nwith a little wonder."}
                </h1>
                <p>
                  {designPreview
                    ? "Simulated preparation · the forest keeps playing."
                    : "We’re turning your idea into the first page."}
                </p>
                {designPreview && (
                  <button
                    className="preview-continue"
                    onClick={() => showPreview("connecting")}
                  >
                    Continue preview <ArrowRight size={15} />
                  </button>
                )}
              </div>
            )}
            {!page && !typing && !waitingForStory && (
              <div className="welcome-question">
                <span className="welcome-kicker">
                  A LITTLE VOICE. A WORLD OF WONDER.
                </span>
                <h1>
                  What story shall
                  <br className="desktop-break" /> we step into?
                </h1>
                <p>Your imagination opens the door.</p>
              </div>
            )}
            {page && !typing && (
              <p className="story-question">{page.question}</p>
            )}
            {ending && !typing ? (
              <div className="story-ending">
                <button className="ending-button float-surface" onClick={reset}>
                  <Sparkles size={17} /> Dream a new story
                </button>
                <span>Keep the wonder. Rest a little.</span>
              </div>
            ) : (
              <section
                className="immersive-composer"
                aria-label={page ? "Shape the story" : "Create your story"}
              >
                {!typing ? (
                  <>
                    <button
                      className={`immersive-mic ${listening ? "is-recording" : ""}`}
                      aria-label={
                        designPreview
                          ? listening
                            ? "Finish simulated reaction"
                            : "Simulate a child reaction"
                          : mic.recording
                            ? "Finish recording"
                            : "Tell your story idea"
                      }
                      disabled={locked || micBusy || !config}
                      onClick={toggleMic}
                    >
                      {micBusy || busy || simulating ? (
                        <LoaderCircle className="spin" size={30} />
                      ) : listening ? (
                        <AudioLines size={32} />
                      ) : (
                        <Mic size={30} />
                      )}
                    </button>
                    <span className="mic-hint">
                      {designPreview
                        ? listening
                          ? "Tap to finish the simulated reaction"
                          : "Sample reaction · no recording"
                        : mic.recording
                          ? "Tap to finish · up to 30 seconds"
                          : mic.transcribing
                            ? "Turning your voice into words…"
                            : paused
                              ? "Resume to keep imagining"
                              : "Tap to talk"}
                    </span>
                    <button
                      ref={typeButtonRef}
                      className="type-instead"
                      disabled={locked || mic.recording || micBusy}
                      onClick={() => setTyping(true)}
                    >
                      Type instead <ArrowRight size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <p className="typing-prompt">
                      What would you like to imagine?
                    </p>
                    <form
                      className="floating-input float-surface"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (canSubmit) {
                          storyInputRef.current?.blur();
                          void tell(input);
                        }
                      }}
                    >
                      <label className="sr-only" htmlFor="story-input">
                        {page ? "Your next idea" : "Your story idea"}
                      </label>
                      <input
                        ref={storyInputRef}
                        id="story-input"
                        value={input}
                        maxLength={1000}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={
                          page
                            ? "What happens next?"
                            : "A princess and a friendly dragon…"
                        }
                        disabled={locked || micBusy}
                        enterKeyHint="send"
                        autoComplete="off"
                      />
                      <button
                        type="submit"
                        aria-label="Send story idea"
                        disabled={!canSubmit}
                      >
                        <ArrowRight size={21} />
                      </button>
                      <button
                        type="button"
                        aria-label="Close typing"
                        onClick={() => setTyping(false)}
                      >
                        <X size={19} />
                      </button>
                    </form>
                  </>
                )}
                {page && !typing && (
                  <div
                    className="floating-reactions"
                    aria-label="Story reactions"
                  >
                    <button
                      disabled={locked || mic.recording || micBusy}
                      onClick={() =>
                        void tell(
                          "That feels scary. Make the story gentler and reassuring.",
                        )
                      }
                    >
                      <Leaf size={14} /> Gentler
                    </button>
                    <button
                      disabled={locked || mic.recording || micBusy}
                      onClick={() =>
                        void tell(
                          "I love this! Let’s have a little more adventure.",
                        )
                      }
                    >
                      <Sparkles size={14} /> More wonder
                    </button>
                    <button
                      disabled={locked || mic.recording || micBusy}
                      onClick={() =>
                        void tell("Let’s give this story a cozy, happy ending.")
                      }
                    >
                      <Moon size={14} /> Cozy ending
                    </button>
                  </div>
                )}
              </section>
            )}
            {!page && !typing && !waitingForStory && (
              <p className="grown-up-note">
                <ShieldCheck size={13} /> Best imagined together with a
                grown-up.
              </p>
            )}
            {(error || orbis.error || previewError) && (
              <div className="floating-error" role="alert">
                <span>{error || orbis.error || previewError}</span>
                {previewError ? (
                  <button onClick={() => showPreview("story")}>
                    Retry preview
                  </button>
                ) : orbis.error && !error ? (
                  <button
                    disabled={paused}
                    onClick={() => {
                      orbis.stop();
                      if (page) void orbis.steer(page.visualPrompt);
                    }}
                  >
                    Retry live video
                  </button>
                ) : (
                  <button
                    aria-label="Dismiss message"
                    onClick={() => setError("")}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
      <dialog
        ref={textDialog}
        className="full-story-dialog"
        aria-labelledby="full-story-heading"
        onCancel={() => setFullText(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setFullText(false);
        }}
      >
        <div className="dialog-content">
          <button
            className="close-dialog icon-button"
            aria-label="Close full story"
            onClick={() => setFullText(false)}
          >
            <X size={21} />
          </button>
          <span className="section-label">READ AT YOUR OWN PACE</span>
          <h2 id="full-story-heading">{page?.title}</h2>
          <p className="text-timing-note">
            Read at your own pace. Subtitle navigation is independent of
            narration.{" "}
            {designPreview &&
              "This is a scripted design preview, not a generated story."}
          </p>
          {page && (
            <>
              <p className="full-narrative">{page.narrative}</p>
              <p>{page.question}</p>
              <div className="story-choices">
                {page.choices.map((choice) => (
                  <button
                    className="primary"
                    key={choice}
                    disabled={locked}
                    onClick={() => {
                      setFullText(false);
                      void tell(choice);
                    }}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </>
          )}
          <nav className="full-page-nav" aria-label="Story pages">
            <button
              disabled={pageIndex === 0 || locked}
              onClick={() => flip(pageIndex - 1)}
            >
              <ArrowLeft size={18} /> Previous page
            </button>
            <span>
              {pageIndex + 1} / {pages.length}
            </span>
            <button
              disabled={pageIndex >= pages.length - 1 || locked}
              onClick={() => flip(pageIndex + 1)}
            >
              Next page <ArrowRight size={18} />
            </button>
          </nav>
          {lastWords && (
            <p className="text-timing-note">Your words: “{lastWords}”</p>
          )}
        </div>
      </dialog>
      <dialog
        ref={dialogRef}
        aria-label={help ? "How WonderBook works" : "Grown-up settings"}
        onCancel={() => {
          setSettings(false);
          setHelp(false);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setSettings(false);
            setHelp(false);
          }
        }}
      >
        <div className="dialog-content">
          <button
            className="close-dialog icon-button"
            aria-label="Close settings"
            onClick={() => {
              setSettings(false);
              setHelp(false);
            }}
          >
            <X size={21} />
          </button>
          {help ? (
            <>
              <span className="section-label">A PEEK BEHIND THE PAGES</span>
              <h2>A story we make together.</h2>
              <p>
                Start with a topic. GPT writes a short page, then turns the
                scene into a visual prompt. Orbis brings that scene to life as a
                continuous video.
              </p>
              <p>
                Tap the microphone, say your idea, then tap again to send it.
                Each question or reaction shapes the next page. You can also
                type or choose a story direction.
              </p>
              <p>
                Live read aloud uses an AI voice from ElevenLabs when
                configured, with browser narration as a fallback. The welcome
                background stays visible until live video has played its first
                frame. Demo mode uses curated stories instead of AI generation.
              </p>
              <p>
                Voice clips are sent to OpenAI for transcription; story text and
                preferences are sent for generation. Only scene descriptions go
                to Reactor. Narrated story pages go to ElevenLabs. This app
                keeps no recordings or saved profiles. Providers’ own data
                policies still apply.
              </p>
            </>
          ) : (
            <>
              <span className="section-label">
                A LITTLE HELP FROM A GROWN-UP
              </span>
              <h2>Make it their kind of story.</h2>
              <p className="dialog-intro">
                Choose what feels comfortable. No name or diagnosis needed.
              </p>
              <label className="field-label" htmlFor="age">
                Reader’s age
              </label>
              <div
                className="age-picker"
                id="age"
                role="group"
                aria-label="Reader’s age"
              >
                {(["3–5", "6–8", "9–12"] as const).map((age) => (
                  <button
                    className={profile.age === age ? "selected" : ""}
                    aria-pressed={profile.age === age}
                    key={age}
                    onClick={() => setProfile((p) => ({ ...p, age }))}
                  >
                    {age}
                    <span>years</span>
                  </button>
                ))}
              </div>
              <div className="preferences">
                {(
                  [
                    {
                      key: "simpleLanguage",
                      label: "Simple language",
                      detail: "Shorter sentences and familiar words.",
                    },
                    {
                      key: "largeText",
                      label: "Larger story text",
                      detail: "A little more room for every word.",
                    },
                    {
                      key: "reducedMotion",
                      label: "Less movement",
                      detail:
                        "Still background until you choose Play; gentler scene prompts.",
                    },
                    {
                      key: "readAloud",
                      label: "Read the story aloud",
                      detail: config?.elevenlabs
                        ? "ElevenLabs AI voice in live mode; browser voice in demo mode."
                        : "Synthetic narration from your browser.",
                    },
                  ] as const
                ).map((option) => (
                  <label className="toggle-row" key={option.key}>
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.detail}</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={profile[option.key]}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          [option.key]: e.target.checked,
                        }))
                      }
                    />
                    <span className="toggle-track" />
                  </label>
                ))}
              </div>
              <div className="connection-box">
                <span className="field-label">Story connections</span>
                <div>
                  <span>
                    <i className={config?.openai ? "connected" : ""} /> GPT
                    stories & transcription
                  </span>
                  <small>{config?.openai ? "Ready" : "Key needed"}</small>
                </div>
                <div>
                  <span>
                    <i className={config?.reactor ? "connected" : ""} /> Orbis
                    live pictures
                  </span>
                  <small>
                    {config?.reactor ? "Key configured" : "Key needed"}
                  </small>
                </div>
                <div>
                  <span>
                    <i className={config?.elevenlabs ? "connected" : ""} />{" "}
                    ElevenLabs narration
                  </span>
                  <small>
                    {config?.elevenlabs ? "Key configured" : "Browser voice"}
                  </small>
                </div>
                <label className="demo-toggle">
                  <input
                    type="checkbox"
                    checked={demo}
                    disabled={inStory || !config?.openai}
                    onChange={(e) => setDemo(e.target.checked)}
                  />{" "}
                  Use sample stories{" "}
                  {inStory && <small>(start a new story to change)</small>}
                </label>
              </div>
              {config?.accessCodeRequired && (
                <label className="access-label">
                  Demo access code
                  <input
                    type="password"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    autoComplete="off"
                  />
                </label>
              )}
              <label className="consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    if (!e.target.checked) reset();
                  }}
                />
                <span>
                  I’m a grown-up supervising this session. I allow sending voice
                  clips and story text to OpenAI, scene descriptions to Reactor,
                  and narrated story pages to ElevenLabs when enabled.
                </span>
              </label>
              <p className="privacy-note">
                The app does not save recordings or profiles. Preferences last
                for this session. Provider data policies apply. Age and language
                changes shape the next page.
              </p>
              <button className="how-it-works" onClick={() => setHelp(true)}>
                How the magic works <CircleHelp size={15} />
              </button>
              <button
                className="primary done-button"
                onClick={() => setSettings(false)}
              >
                <Check size={18} /> Ready for a little wonder
              </button>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
