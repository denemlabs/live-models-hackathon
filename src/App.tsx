import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Feather,
  Leaf,
  LoaderCircle,
  Mic,
  Moon,
  Pause,
  Phone,
  Play,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Volume2,
  VolumeX,
  Waves,
  X,
} from "lucide-react";
import { ProfileSchema, type Profile, type StoryPage } from "../shared/story";
import type { SceneArgs } from "../shared/storyteller";
import Illustration from "./Illustration";
import { api } from "./api";
import { useOrbis } from "./useOrbis";
import { useMicrophone } from "./useMicrophone";

// The ElevenLabs WebRTC client is only needed once a child places a call.
const StoryCall = lazy(() => import("./StoryCall"));

type Config = {
  openai: boolean;
  reactor: boolean;
  storyteller: boolean;
  accessCodeRequired: boolean;
};
const inspirations = [
  {
    name: "An enchanted forest",
    input: "A little fox who finds a magical lantern in an enchanted forest",
    icon: Leaf,
    theme: "forest",
  },
  {
    name: "An ocean adventure",
    input: "A little turtle and a magical seashell under the ocean",
    icon: Waves,
    theme: "ocean",
  },
  {
    name: "A trip to the moon",
    input: "A moon rabbit who helps a little lost star find its home",
    icon: Moon,
    theme: "space",
  },
] as const;

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [demo, setDemo] = useState(true);
  const [profile, setProfile] = useState<Profile>(() =>
    ProfileSchema.parse({}),
  );
  const [input, setInput] = useState("");
  const [topic, setTopic] = useState("");
  const [pages, setPages] = useState<StoryPage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const [consent, setConsent] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [paused, setPaused] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [lastWords, setLastWords] = useState("");
  const [selectedTheme, setSelectedTheme] = useState<
    "forest" | "ocean" | "space"
  >("forest");
  const bookRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const request = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);
  const page = pages[pageIndex];
  const orbis = useOrbis(accessCode);
  const inStory = pages.length > 0 || opening;
  const locked = busy || paused;
  const mute = () => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  };

  useEffect(() => {
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
  }, []);
  useEffect(() => {
    if (settings || help) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [settings, help]);
  useEffect(() => {
    if (video.current) video.current.srcObject = orbis.stream;
  }, [orbis.stream, inStory]);
  useEffect(() => {
    if (!profile.readAloud) mute();
  }, [profile.readAloud]);
  useEffect(() => {
    if (video.current && orbis.stream) {
      if (paused) video.current.pause();
      else void video.current.play().catch(() => {});
    }
  }, [paused, orbis.stream]);
  useEffect(
    () => () => {
      request.current?.abort();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  function read(text: string) {
    mute();
    if (!window.speechSynthesis) {
      setError(
        "Read aloud isn’t available in this browser. The story is always shown as text.",
      );
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = profile.age === "3–5" ? 0.8 : 0.9;
    utterance.pitch = 1.05;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

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
      const result = await api<{ page: StoryPage }>(
        "/api/story",
        { input: words, topic: first ? words : topic, history, profile, demo },
        accessCode,
        controller.signal,
      );
      if (generation !== requestGeneration.current) return;
      if (first && !profile.reducedMotion)
        await new Promise((resolve) => setTimeout(resolve, 900));
      if (generation !== requestGeneration.current) return;
      setPages((prev) => [...prev, result.page]);
      setPageIndex(pages.length);
      setInput("");
      setOpening(false);
      if (profile.readAloud)
        read(result.page.narrative + " " + result.page.question);
      if (!demo && config?.reactor) void orbis.steer(result.page.visualPrompt);
      setTimeout(() => bookRef.current?.focus(), 50);
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
    if (!config?.openai) {
      setError(
        "Add an OpenAI key to use the microphone. For now, type an idea or choose one below.",
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
    setInCall(false);
    setPages([]);
    setPageIndex(0);
    setOpening(false);
    setBusy(false);
    setPaused(false);
    setInput("");
    setTopic("");
    setError("");
    setLastWords("");
  }
  function flip(index: number) {
    mute();
    setPageIndex(index);
    if (profile.readAloud) read(pages[index].narrative);
    if (!demo && config?.reactor && !paused)
      void orbis.steer(pages[index].visualPrompt);
  }
  async function togglePause() {
    const value = !paused;
    setPaused(value);
    mute();
    mic.cancel();
    if (value && !orbis.stream) orbis.stop();
    else if (!value && !demo && config?.reactor && !orbis.stream && page)
      void orbis.steer(page.visualPrompt);
    else await orbis.pause(value);
  }
  function callStoryteller() {
    if (!config?.storyteller) {
      setError(
        "Add an ElevenLabs key to call the storyteller. You can still read a story here.",
      );
      return;
    }
    if (!consent) {
      setSettings(true);
      setError("A grown-up needs to enable live storytelling first.");
      return;
    }
    requestGeneration.current++;
    request.current?.abort();
    mic.cancel();
    mute();
    setError("");
    setBusy(false);
    setPaused(false);
    setInCall(true);
  }
  function callScene(scene: SceneArgs) {
    setSelectedTheme(scene.theme);
    if (config?.reactor && scene.visual_prompt)
      void orbis.steer(scene.visual_prompt);
  }
  function callPage(page: StoryPage) {
    setPages((prev) => [...prev, page]);
    setPageIndex(pages.length);
    if (!topic) setTopic(page.title);
  }
  const canSubmit =
    input.trim().length > 0 &&
    !locked &&
    !micBusy &&
    !mic.recording &&
    config !== null;

  return (
    <div
      className={`app ${profile.reducedMotion ? "reduced-motion" : ""} ${profile.largeText ? "large-text" : ""}`}
    >
      <header className="header">
        <button
          className="brand"
          onClick={reset}
          aria-label="Little Wonder home"
        >
          <span className="brand-icon">
            <BookOpen size={25} />
            <Sparkles size={13} />
          </span>
          <span>
            little wonder<span className="brand-dot">✦</span>
          </span>
        </button>
        <div className="header-actions">
          <span className="mode-label">
            <span className={demo ? "status-dot demo" : "status-dot"} />
            {demo ? "Demo storybook" : "Live storytelling"}
          </span>
          <button className="settings-button" onClick={() => setSettings(true)}>
            <Settings2 size={17} />
            <span>Grown-up settings</span>
          </button>
        </div>
      </header>

      <main>
        {!inStory ? (
          <>
            <section className="welcome">
              <div className="eyebrow">
                <span /> A LITTLE IDEA. A WHOLE NEW WORLD. <span />
              </div>
              <h1>
                Every great adventure
                <br />
                begins with <em>“what if?”</em>
                <span className="heading-star">✧</span>
              </h1>
              <p>A story that listens. A world that changes with you.</p>
            </section>
            <section className="create-layout">
              <div className="idea-panel">
                <span className="section-label">LET’S MAKE A LITTLE MAGIC</span>
                <h2>What’s your story about?</h2>
                <p>
                  A tiny dragon? A moon made of cheese?
                  <br />
                  Your imagination gets to choose.
                </p>
                <button
                  className={`voice-button ${mic.recording ? "recording" : ""}`}
                  onClick={toggleMic}
                  disabled={locked || micBusy || config === null}
                >
                  <span className="mic-circle">
                    {micBusy ? (
                      <LoaderCircle className="spin" size={25} />
                    ) : mic.recording ? (
                      <AudioLines size={27} />
                    ) : (
                      <Mic size={25} />
                    )}
                  </span>
                  <span>
                    <strong>
                      {mic.recording
                        ? "I’m listening…"
                        : mic.transcribing
                          ? "Listening to your idea…"
                          : mic.requesting
                            ? "Opening the microphone…"
                            : "Tell me your idea"}
                      <small>
                        {mic.recording
                          ? "Tap when you’re done · up to 30 seconds"
                          : "Tap the microphone to begin"}
                      </small>
                    </strong>
                  </span>
                  {mic.recording && <span className="record-dot" />}
                </button>
                <button
                  className="call-button"
                  onClick={callStoryteller}
                  disabled={locked || mic.recording || micBusy}
                >
                  <span className="call-circle">
                    <Phone size={21} />
                  </span>
                  <span>
                    <strong>
                      Call the storyteller
                      <small>
                        Talk out loud, and they’ll tell it back to you
                      </small>
                    </strong>
                  </span>
                  <ChevronRight size={17} />
                </button>
                <div className="or-line">
                  <span /> or write a little something <span />
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void tell(input);
                  }}
                >
                  <label className="sr-only" htmlFor="idea">
                    Your story idea
                  </label>
                  <textarea
                    id="idea"
                    value={input}
                    maxLength={1000}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="I want a story about a little fox who…"
                    rows={2}
                    disabled={locked || mic.recording || micBusy}
                  />
                  <button
                    className="primary create-button"
                    disabled={!canSubmit}
                  >
                    Open my storybook <ArrowRight size={18} />
                  </button>
                </form>
                <p className="tiny-note">
                  <ShieldCheck size={14} /> A little wonder, shared with a
                  grown-up.
                </p>
              </div>
              <div className="preview-wrap">
                <span className="floating-star star-one">✧</span>
                <span className="floating-star star-two">✦</span>
                <div className="preview-book">
                  <div className="preview-art">
                    <Illustration theme={selectedTheme} />
                    <span className="preview-caption">
                      <span /> A world waiting for your words
                    </span>
                  </div>
                  <div className="preview-paper">
                    <span>ONCE UPON A POSSIBILITY…</span>
                    <h3>Your story starts here.</h3>
                    <span className="paper-flourish">✦</span>
                  </div>
                </div>
                <div className="handwritten">
                  You bring the idea.
                  <br />
                  We’ll bring the wonder. <span>⤴</span>
                </div>
              </div>
            </section>
            <section className="inspiration">
              <span>A little spark to get you started</span>
              <div>
                {inspirations.map((item) => (
                  <button
                    key={item.theme}
                    onClick={() => {
                      setInput(item.input);
                      setSelectedTheme(item.theme);
                    }}
                  >
                    <item.icon size={18} />
                    {item.name}
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="story-section">
            <div className="story-heading">
              <button className="text-button" onClick={reset}>
                <ArrowLeft size={17} /> A new story
              </button>
              <span className="section-label">
                {demo ? "YOUR DEMO ADVENTURE" : "YOUR VERY OWN LIVING STORY"}
              </span>
              <div className="story-heading-actions">
                <button
                  className="text-button"
                  onClick={callStoryteller}
                  disabled={busy}
                >
                  <Phone size={15} /> Call the storyteller
                </button>
                <button
                  className="text-button"
                  onClick={togglePause}
                  disabled={busy}
                >
                  {paused ? <Play size={16} /> : <Pause size={16} />}{" "}
                  {paused ? "Resume" : "Pause"}
                </button>
              </div>
            </div>
            <div
              className={`storybook ${opening ? "opening" : ""}`}
              ref={bookRef}
              tabIndex={-1}
            >
              <div className="story-art">
                <Illustration theme={page?.theme || selectedTheme} />
                <video
                  ref={video}
                  autoPlay
                  muted
                  playsInline
                  className={orbis.stream ? "live-video visible" : "live-video"}
                  onPlaying={() => {
                    if (paused) video.current?.pause();
                  }}
                />
                <span className="picture-label">
                  <span />
                  {demo ? "Illustrated demo" : orbis.status}
                </span>
                {paused && (
                  <div className="paused-overlay">
                    <Pause size={30} />
                    <span>A little pause</span>
                  </div>
                )}
              </div>
              <article
                className="story-paper"
                aria-live="polite"
                aria-busy={busy}
              >
                {opening ? (
                  <div className="opening-message">
                    <BookOpen size={50} />
                    <span className="section-label">ONCE UPON A TIME…</span>
                    <h2>Your world is opening.</h2>
                    <p>A little idea is becoming a story.</p>
                  </div>
                ) : (
                  page && (
                    <>
                      <div className="page-top">
                        <span>
                          CHAPTER {String(pageIndex + 1).padStart(2, "0")}
                        </span>
                        <Feather size={19} />
                      </div>
                      <h2>{page.title}</h2>
                      <p className="narrative">{page.narrative}</p>
                      <div className="story-question">
                        <Sparkles size={17} />
                        <p>{page.question}</p>
                      </div>
                      <div className="choices">
                        {page.choices.slice(0, 2).map((choice) => (
                          <button
                            key={choice}
                            disabled={locked || mic.recording || micBusy}
                            onClick={() => void tell(choice)}
                          >
                            {choice}
                            <ArrowRight size={15} />
                          </button>
                        ))}
                      </div>
                      <div className="page-bottom">
                        <button
                          className="icon-button"
                          aria-label={
                            speaking ? "Stop narration" : "Read this page aloud"
                          }
                          onClick={() =>
                            speaking
                              ? mute()
                              : read(page.narrative + " " + page.question)
                          }
                          disabled={paused || busy || mic.recording || micBusy}
                        >
                          {speaking ? (
                            <VolumeX size={18} />
                          ) : (
                            <Volume2 size={18} />
                          )}
                        </button>
                        <span>— {pageIndex + 1} —</span>
                        <div className="page-navigation">
                          <button
                            aria-label="Previous page"
                            disabled={
                              pageIndex === 0 ||
                              locked ||
                              mic.recording ||
                              micBusy
                            }
                            onClick={() => flip(pageIndex - 1)}
                          >
                            <ArrowLeft size={17} />
                          </button>
                          <button
                            aria-label="Next page"
                            disabled={
                              pageIndex === pages.length - 1 ||
                              locked ||
                              mic.recording ||
                              micBusy
                            }
                            onClick={() => flip(pageIndex + 1)}
                          >
                            <ArrowRight size={17} />
                          </button>
                        </div>
                      </div>
                    </>
                  )
                )}
              </article>
            </div>
            <div className="story-controls">
              <div className="story-input-label">
                <span className="section-label">YOU’RE PART OF THE STORY</span>
                <p>
                  Ask a question. Change the adventure. Tell us how you feel.
                </p>
              </div>
              <form
                className="reaction-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void tell(input);
                }}
              >
                <button
                  type="button"
                  className={`reaction-mic ${mic.recording ? "recording" : ""}`}
                  aria-label={
                    mic.recording ? "Finish recording" : "Talk to the story"
                  }
                  onClick={toggleMic}
                  disabled={locked || micBusy}
                >
                  {micBusy ? (
                    <LoaderCircle className="spin" size={20} />
                  ) : mic.recording ? (
                    <AudioLines size={21} />
                  ) : (
                    <Mic size={21} />
                  )}
                </button>
                <label className="sr-only" htmlFor="reaction">
                  Tell the story what happens next
                </label>
                <input
                  id="reaction"
                  value={input}
                  maxLength={1000}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    mic.recording
                      ? "Listening… tap the mic when you’re done"
                      : "“Can the fox have a friend?”"
                  }
                  disabled={locked || mic.recording || micBusy}
                />
                <button
                  className="send-button"
                  disabled={!canSubmit}
                  aria-label="Send to the story"
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <ArrowRight size={20} />
                  )}
                </button>
              </form>
              <div className="reaction-chips">
                <button
                  disabled={locked || mic.recording || micBusy}
                  onClick={() =>
                    void tell(
                      "Please make the story gentler. I feel a little scared.",
                    )
                  }
                >
                  <Leaf size={14} /> Make it gentler
                </button>
                <button
                  disabled={locked || mic.recording || micBusy}
                  onClick={() =>
                    void tell(
                      "I am curious! Let’s explore something surprising and friendly.",
                    )
                  }
                >
                  <Star size={14} /> More adventure
                </button>
                <button
                  disabled={locked || mic.recording || micBusy}
                  onClick={() =>
                    void tell("Let’s give this story a cozy, happy ending.")
                  }
                >
                  <Moon size={14} /> A cozy ending
                </button>
              </div>
              {lastWords && (
                <p className="last-words">Your words: “{lastWords}”</p>
              )}
            </div>
            {busy && !opening && (
              <p className="working-note" role="status">
                <LoaderCircle className="spin" size={16} /> Turning your words
                into the next page…
              </p>
            )}
            {!demo &&
              config?.reactor &&
              !orbis.stream &&
              !orbis.error &&
              page && (
                <p className="working-note">
                  Live pictures can take a few minutes to wake up. Your story is
                  ready to read.
                </p>
              )}
            {orbis.error && (
              <div className="error-message" role="alert">
                {orbis.error}
                <button
                  onClick={() => {
                    orbis.stop();
                    if (page) void orbis.steer(page.visualPrompt);
                  }}
                  disabled={paused}
                >
                  Reconnect pictures
                </button>
              </div>
            )}
          </section>
        )}
        {error && (
          <div className="error-message" role="alert">
            <CircleHelp size={18} />
            <span>{error}</span>
            <button aria-label="Dismiss message" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {demo && (
          <p className="demo-note">
            Demo mode uses three illustrated sample adventures. Add API keys for
            original stories and live video.
          </p>
        )}
      </main>
      {inCall && (
        <Suspense
          fallback={
            <div className="call call-loading">
              <LoaderCircle className="spin" size={30} />
              <p>Reaching the storyteller…</p>
            </div>
          }
        >
          <StoryCall
            accessCode={accessCode}
            profile={profile}
            topic={topic}
            history={pages}
            stream={orbis.stream}
            pictureStatus={orbis.status}
            livePictures={!!config?.reactor}
            onScene={callScene}
            onPage={callPage}
            onLeave={() => setInCall(false)}
          />
        </Suspense>
      )}

      <footer>
        <span>
          <BookOpen size={15} /> Small stories. Endless possibilities.
        </span>
        <div>
          <span>Made with GPT + Orbis + ElevenLabs</span>
          <button onClick={() => setHelp(true)}>
            How the magic works <CircleHelp size={14} />
          </button>
        </div>
      </footer>

      <dialog
        ref={dialogRef}
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
                A story call is different. An ElevenLabs storyteller joins over
                a live connection and tells the story out loud, in real time.
                You can interrupt, ask questions, and change your mind, and the
                pages fill in as they talk.
              </p>
              <p>
                Read aloud uses your browser’s synthetic voice. Illustrations
                stay visible while live video connects. Demo mode uses curated
                scenes instead of AI generation.
              </p>
              <p>
                Voice clips are sent to OpenAI for transcription; story text and
                preferences are sent for generation. Only scene descriptions go
                to Reactor. This app keeps no recordings or saved profiles.
                Providers’ own data policies still apply.
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
                      detail: "Still interface and gentler video prompts.",
                    },
                    {
                      key: "readAloud",
                      label: "Read the story aloud",
                      detail: "Synthetic narration from your browser.",
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
                    stories & voice
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
                    <i className={config?.storyteller ? "connected" : ""} />{" "}
                    ElevenLabs story calls
                  </span>
                  <small>{config?.storyteller ? "Ready" : "Key needed"}</small>
                </div>
                <label className="demo-toggle">
                  <input
                    type="checkbox"
                    checked={demo}
                    disabled={inStory || !config?.openai}
                    onChange={(e) => setDemo(e.target.checked)}
                  />{" "}
                  Use illustrated demo{" "}
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
                  and live call audio to ElevenLabs.
                </span>
              </label>
              <p className="privacy-note">
                The app does not save recordings or profiles. Preferences last
                for this session. Provider data policies apply. Age and language
                changes shape the next page.
              </p>
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
