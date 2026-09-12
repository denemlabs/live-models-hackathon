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
import {
  ProfileSchema,
  type Profile,
  type StoryPage,
  type Interaction,
} from "../shared/story";
import type { SceneArgs } from "../shared/storyteller";
import { STORY_VOICES } from "../shared/voices";
import Illustration from "./Illustration";
import { api } from "./api";
import { useOrbis } from "./useOrbis";
import { useMicrophone } from "./useMicrophone";
import { useNarration } from "./useNarration";

// The ElevenLabs WebRTC client is only needed once a child places a call.
const StoryCall = lazy(() => import("./StoryCall"));

type Config = {
  openai: boolean;
  reactor: boolean;
  elevenlabs: boolean;
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
  const [inCall, setInCall] = useState(false);
  const [aside, setAside] = useState<StoryPage | null>(null);
  const [questionMode, setQuestionMode] = useState(false);
  const [conversation, setConversation] = useState<
    { question: string; answer: string }[]
  >([]);
  const [replays, setReplays] = useState(0);
  const [quietHelp, setQuietHelp] = useState(false);
  const activity = useRef(Date.now());
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
  const { speaking, read, mute } = useNarration({
    elevenlabs: !!config?.elevenlabs && consent && !demo,
    enabled: profile.readAloud,
    accessCode,
    voice: profile.voice,
    youngReader: profile.age === "3–5",
    onError: setError,
  });

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
    if (video.current && orbis.stream) {
      if (paused) video.current.pause();
      else void video.current.play().catch(() => {});
    }
  }, [paused, orbis.stream]);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );

  async function tell(
    words: string,
    interaction: Interaction = questionMode ? "question" : "auto",
  ) {
    const calming = interaction === "calm" && !!page;
    if (!words.trim() || ((busy || paused) && !calming)) return;
    if (!demo && !consent) {
      setSettings(true);
      setError("A grown-up needs to enable live storytelling first.");
      return;
    }
    mute();
    mic.cancel();
    if (calming) {
      orbis.stop();
      setPaused(true);
    }
    setQuietHelp(false);
    activity.current = Date.now();
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
      const branch = pages.slice(0, pageIndex + 1);
      const history =
        branch.length > 12 ? [branch[0], ...branch.slice(-11)] : branch;
      const result = await api<{ page: StoryPage }>(
        "/api/story",
        {
          input: words,
          topic: first ? words : topic,
          history,
          profile,
          demo,
          interaction,
          conversation,
        },
        accessCode,
        controller.signal,
      );
      if (generation !== requestGeneration.current) return;
      if (first && !profile.reducedMotion)
        await new Promise((resolve) => setTimeout(resolve, 900));
      if (generation !== requestGeneration.current) return;
      const isAside =
        result.page.responseKind === "answer" ||
        result.page.responseKind === "simplify";
      const isCalm = result.page.responseKind === "calm";
      if (isAside) {
        setAside(result.page);
        setConversation((prev) =>
          [
            ...prev,
            { question: words, answer: result.page.narrative.slice(0, 2000) },
          ].slice(-6),
        );
        if (result.page.responseKind === "simplify")
          setProfile((prev) => ({ ...prev, simpleLanguage: true }));
      } else {
        setAside(null);
        setPages([...branch, result.page]);
        setPageIndex(branch.length);
        setConversation([]);
        setReplays(0);
      }
      setQuestionMode(false);
      if (isCalm) {
        orbis.stop();
        setPaused(true);
      }
      if (!isAside && !isCalm && !demo && config?.reactor)
        void orbis.steer(result.page.visualPrompt, result.page.visualChange);
      setInput("");
      setOpening(false);
      if (profile.readAloud && !isCalm)
        void read(
          result.page.narrative + (isAside ? "" : " " + result.page.question),
          true,
        );
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
  useEffect(() => {
    if (
      !page ||
      busy ||
      paused ||
      speaking ||
      mic.recording ||
      micBusy ||
      settings ||
      help
    ) {
      activity.current = Date.now();
      return;
    }
    const timer = window.setInterval(() => {
      if (Date.now() - activity.current > 30000) setQuietHelp(true);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [page, busy, paused, speaking, mic.recording, micBusy, settings, help]);
  function askQuestion() {
    mute();
    setQuestionMode(true);
    setInput("");
    document.getElementById("reaction")?.focus();
  }
  function replay() {
    setReplays((value) => value + 1);
    void read((aside || page).narrative);
  }
  function reset() {
    requestGeneration.current++;
    request.current?.abort();
    mic.cancel();
    mute();
    orbis.stop();
    setInCall(false);
    setAside(null);
    setQuestionMode(false);
    setConversation([]);
    setReplays(0);
    setQuietHelp(false);
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
    setAside(null);
    setQuestionMode(false);
    setConversation([]);
    setReplays(0);
    setPageIndex(index);
    if (profile.readAloud) void read(pages[index].narrative, true);
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
    if (!value && page && profile.readAloud)
      void read((aside || page).narrative, true);
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
      onPointerDown={() => {
        activity.current = Date.now();
        setQuietHelp(false);
      }}
      onKeyDown={() => {
        activity.current = Date.now();
        setQuietHelp(false);
      }}
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
                      {(aside || page).acknowledgment && (
                        <p className="contribution">
                          <Check size={14} />
                          {(aside || page).acknowledgment}
                        </p>
                      )}
                      {aside && (
                        <span className="answer-label">
                          {aside.responseKind === "simplify"
                            ? "IN SIMPLER WORDS"
                            : "A MOMENT TO WONDER"}{" "}
                          · YOUR PLACE IS SAVED
                        </span>
                      )}
                      <p className="narrative">{(aside || page).narrative}</p>
                      <div className="story-question">
                        <Sparkles size={17} />
                        <p>
                          {aside
                            ? "Ready to return to our adventure?"
                            : page.question}
                        </p>
                      </div>
                      <div
                        className={`choices ${replays >= 2 ? "choices-roomy" : ""}`}
                      >
                        {paused && page.responseKind === "calm" ? (
                          <button disabled={busy} onClick={togglePause}>
                            Continue gently <Play size={15} />
                          </button>
                        ) : aside ? (
                          <>
                            <button
                              disabled={locked || mic.recording || micBusy}
                              onClick={() => {
                                mute();
                                setAside(null);
                                setQuestionMode(false);
                              }}
                            >
                              Back to our adventure <ArrowRight size={15} />
                            </button>
                            <button
                              disabled={locked || mic.recording || micBusy}
                              onClick={askQuestion}
                            >
                              Ask another question <CircleHelp size={15} />
                            </button>
                          </>
                        ) : page.responseKind === "ending" ? (
                          <button disabled={busy} onClick={reset}>
                            Start a new adventure <BookOpen size={15} />
                          </button>
                        ) : page.choices.length === 0 ? (
                          <div className="open-answer">
                            <p>
                              Your idea belongs in this story. Say it or type it
                              below.
                            </p>
                            <button
                              disabled={locked || mic.recording || micBusy}
                              onClick={() => {
                                setQuestionMode(false);
                                document.getElementById("reaction")?.focus();
                              }}
                            >
                              Share my idea <Sparkles size={15} />
                            </button>
                            <button
                              disabled={locked || mic.recording || micBusy}
                              onClick={() =>
                                void tell(
                                  "I’m not sure. Please give me a couple of ideas to choose from.",
                                  "continue",
                                )
                              }
                            >
                              Give me ideas <CircleHelp size={15} />
                            </button>
                          </div>
                        ) : (
                          page.choices.slice(0, 2).map((choice) => (
                            <button
                              key={choice}
                              disabled={locked || mic.recording || micBusy}
                              onClick={() => void tell(choice, "continue")}
                            >
                              {choice}
                              <ArrowRight size={15} />
                            </button>
                          ))
                        )}
                      </div>
                      <div className="page-bottom">
                        <button
                          className="icon-button"
                          aria-label={
                            speaking ? "Stop narration" : "Read this page aloud"
                          }
                          onClick={() => (speaking ? mute() : replay())}
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
              <div className="interaction-modes" aria-label="Story interaction">
                <button
                  aria-pressed={!questionMode}
                  disabled={locked || mic.recording || micBusy}
                  onClick={() => setQuestionMode(false)}
                >
                  Change the story
                </button>
                <button
                  aria-pressed={questionMode}
                  disabled={locked || mic.recording || micBusy}
                  onClick={askQuestion}
                >
                  Ask a question
                </button>
              </div>
              <p className="interaction-hint">
                {questionMode
                  ? "Your question gets an answer. We’ll keep your place in the story."
                  : "Your words and choices shape what happens next."}{" "}
                Tap the mic to talk; tap again to send. No camera.
              </p>
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
                      : questionMode
                        ? "Why does the moon shine?"
                        : page?.choices.length === 0
                          ? "My idea is…"
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
                  disabled={!page || (busy && paused)}
                  onClick={() =>
                    void tell("Please make the story gentler.", "calm")
                  }
                >
                  <Leaf size={14} /> Make it gentler
                </button>
                <button
                  disabled={locked || mic.recording || micBusy}
                  onClick={() =>
                    void tell(
                      "Let’s explore something surprising and friendly.",
                      "continue",
                    )
                  }
                >
                  <Star size={14} /> More adventure
                </button>
                <button
                  disabled={locked || mic.recording || micBusy}
                  onClick={() =>
                    void tell(
                      "Let’s give this story a cozy, happy ending.",
                      "ending",
                    )
                  }
                >
                  <Moon size={14} /> A cozy ending
                </button>
              </div>
              {paused && !busy && page?.responseKind === "calm" && (
                <p className="adaptive-help" role="status">
                  The pictures are stopped. Your gentler page is ready. Choose
                  “Continue gently” whenever you’re ready.
                </p>
              )}
              {replays >= 2 && !aside && !profile.simpleLanguage && (
                <div className="adaptive-help">
                  <span>Want a shorter version of this page?</span>
                  <button
                    disabled={locked || mic.recording || micBusy}
                    onClick={() =>
                      void tell(
                        "Please explain this page in simpler words.",
                        "simplify",
                      )
                    }
                  >
                    Use simpler words
                  </button>
                </div>
              )}
              {quietHelp && (
                <div className="adaptive-help">
                  <span>Take your time. The adventure can wait.</span>
                  <button
                    disabled={locked || mic.recording || micBusy}
                    onClick={replay}
                  >
                    Hear it again
                  </button>
                  <button onClick={() => setQuietHelp(false)}>
                    I’m still reading
                  </button>
                </div>
              )}
              {lastWords && (
                <p className="last-words">Your words: “{lastWords}”</p>
              )}
            </div>
            {busy && !opening && (
              <p className="working-note" role="status">
                <LoaderCircle className="spin" size={16} /> Listening to your
                contribution…
              </p>
            )}
            {!demo &&
              !paused &&
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
                Questions get answers without skipping ahead. Story requests
                shape the next page. Choose “Make it gentler” to stop the
                pictures and prepare a calmer scene. You can also type or choose
                a story direction. No camera is used.
              </p>
              <p>
                A story call is different. An ElevenLabs storyteller joins over
                a live connection and tells the story out loud, in real time.
                You can interrupt, ask questions, and change your mind, and the
                pages fill in as they talk.
              </p>
              <p>
                Live read aloud uses an AI voice from ElevenLabs when
                configured, with browser narration as a fallback. Illustrations
                stay visible while live video connects. Demo mode uses curated
                scenes instead of AI generation.
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
              <label className="field-label" htmlFor="voice">
                Storyteller’s voice
              </label>
              <div
                className="voice-picker"
                id="voice"
                role="group"
                aria-label="Storyteller’s voice"
              >
                {STORY_VOICES.map((voice) => (
                  <button
                    className={profile.voice === voice.key ? "selected" : ""}
                    aria-pressed={profile.voice === voice.key}
                    key={voice.key}
                    onClick={() =>
                      setProfile((p) => ({ ...p, voice: voice.key }))
                    }
                  >
                    <strong>{voice.label}</strong>
                    <span>{voice.detail}</span>
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
                  and narrated story pages to ElevenLabs when enabled, plus live
                  call audio to ElevenLabs during a story call.
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
