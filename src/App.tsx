import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
  Phone,
  Play,
  Settings2,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  ProfileSchema,
  choiceVisualFor,
  type Profile,
  type StoryPage,
  type Interaction,
} from "../shared/story";
import type { SceneArgs } from "../shared/storyteller";
import { pageNarration, spokenChoice } from "../shared/storyInteraction";
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

// The ElevenLabs WebRTC client is only needed once a child places a call.
const StoryCall = lazy(() => import("./StoryCall"));

type Config = {
  openai: boolean;
  reactor: boolean;
  elevenlabs: boolean;
  narration?: boolean;
  storyteller: boolean;
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
  const bookRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [typing, setTyping] = useState(false);
  const [fullText, setFullText] = useState(false);
  const [sound, setSound] = useState(!designPreview);
  const [handsFree, setHandsFree] = useState(false);
  const previousCompletion = useRef(0);
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
  const { speaking, completion, read, mute } = useNarration({
    cloudVoice:
      !!(config?.narration || config?.elevenlabs || config?.openai) &&
      consent &&
      !demo,
    enabled: profile.readAloud,
    accessCode,
    youngReader: profile.age === "3–5",
    onError: setError,
    allowBrowserVoice: demo || designPreview,
    waitForPicture: () =>
      !demo && config?.reactor ? orbis.waitForPicture() : Promise.resolve(true),
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
  useEffect(() => {
    if (orbis.error) mute();
  }, [orbis.error, mute]);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );

  async function tell(
    words: string,
    interaction: Interaction = questionMode ? "question" : "auto",
    choiceIndex?: number,
    originalWords = words,
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
    setTyping(false);
    if (designPreview) setPreviewStage(pages.length ? "adapting" : "preparing");
    setLastWords(originalWords);
    const first = !pages.length;
    if (first) {
      if (!demo && config?.reactor) void orbis.prepare();
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
      // These plans were generated and moderated with the previous page.
      // Dispatch before requesting text; never wait for the next GPT response.
      const preparedChoice =
        interaction === "continue" && !demo && config?.reactor
          ? choiceVisualFor(page, choiceIndex, words)
          : undefined;
      if (preparedChoice)
        void orbis.steer(preparedChoice.scene, preparedChoice.change);
      const result = designPreview
        ? await (async () => {
            await abortablePreviewDelay(controller.signal);
            const next = previewResponse(words);
            setPreviewStage(next);
            return { page: previewPage(next) };
          })()
        : await api<{ page: StoryPage }>(
            "/api/story",
            {
              input: words,
              topic: first ? words : topic,
              history,
              profile,
              demo,
              interaction,
              choiceIndex,
              conversation,
            },
            accessCode,
            controller.signal,
          );
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
      if (!preparedChoice && !isAside && !isCalm && !demo && config?.reactor)
        void orbis.steer(result.page.visualPrompt, result.page.visualChange);
      setInput("");
      setTyping(false);
      setOpening(false);
      if (profile.readAloud && sound && !isCalm)
        void read(pageNarration(result.page), true);
      requestAnimationFrame(() => {
        if (generation === requestGeneration.current)
          bookRef.current?.focus({ preventScroll: true });
      });
    } catch (e) {
      if (generation === requestGeneration.current) {
        if (first) orbis.stop();
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
      respond(text);
    },
    setError,
  );
  const micBusy = mic.transcribing || mic.requesting;
  useEffect(() => {
    const finished = previousCompletion.current !== completion;
    previousCompletion.current = completion;
    if (
      finished &&
      handsFree &&
      page &&
      !aside &&
      !paused &&
      !busy &&
      !inCall &&
      !settings &&
      !fullText &&
      !error &&
      !orbis.error &&
      consent &&
      config?.openai &&
      !micBusy &&
      !mic.recording &&
      page.responseKind !== "ending"
    ) {
      void mic.toggle(true);
    }
  }, [
    completion,
    speaking,
    handsFree,
    page,
    aside,
    paused,
    busy,
    inCall,
    settings,
    fullText,
    error,
    orbis.error,
    consent,
    config,
    micBusy,
    mic.recording,
    mic.toggle,
  ]);
  function respond(words: string) {
    const index =
      page && !aside && !questionMode
        ? spokenChoice(words, page.choices)
        : undefined;
    if (index !== undefined)
      void tell(page.choices[index], "continue", index, words);
    else void tell(words);
  }
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
    void mic.toggle(true);
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
    setTyping(true);
  }
  function replay() {
    setSound(true);
    setReplays((value) => value + 1);
    void read(pageNarration(aside || page));
  }
  function reset() {
    requestGeneration.current++;
    request.current?.abort();
    mic.cancel();
    mute();
    orbis.resetStory();
    setInCall(false);
    setHandsFree(false);
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
    setAside(null);
    setQuestionMode(false);
    setConversation([]);
    setReplays(0);
    setPageIndex(index);
    if (!demo && config?.reactor && !paused)
      void orbis.steer(pages[index].visualPrompt);
    if (profile.readAloud && sound && !paused)
      void read(pageNarration(pages[index]), true);
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
    if (!value && page && profile.readAloud && sound)
      void read(pageNarration(aside || page), true);
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
    if (config?.reactor && scene.visual_prompt)
      void orbis.steer(scene.visual_prompt);
  }
  async function prepareCallPictures() {
    if (!config?.reactor) return true;
    return !!(await orbis.steer(
      page?.visualPrompt ||
        "A softly glowing open storybook in a peaceful watercolor forest clearing, warm light, slow gentle movement, no written text.",
    ));
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

  const stageLiveChange = useCallback(
    (ready: boolean) => {
      setLiveReady(ready);
      if (ready && orbis.stream) orbis.pictureReady(orbis.stream);
    },
    [orbis.stream, orbis.pictureReady],
  );
  const isLive = !!orbis.stream && liveReady;
  const connecting = designPreview
    ? previewStage === "connecting"
    : !demo && !!config?.reactor && !!page && !isLive && !orbis.error;
  const previewError =
    designPreview && previewStage === "error"
      ? "The live world couldn’t connect. Your story is still here."
      : "";
  const waitingForStory = !page && (busy || opening || simulating);
  const ending =
    page?.responseKind === "ending" ||
    (!!page && /\bThe end[.!]?\s*$/i.test(page.narrative));
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
                ? orbis.status
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
    else if (page && !paused && profile.readAloud)
      void read(pageNarration(aside || page));
  };

  const storyActions =
    page &&
    !ending &&
    (paused && page.responseKind === "calm" ? (
      <button
        disabled={busy}
        onClick={() => {
          setFullText(false);
          void togglePause();
        }}
      >
        Continue gently <Play size={14} />
      </button>
    ) : aside ? (
      <>
        <button
          disabled={locked}
          onClick={() => {
            mute();
            setAside(null);
            setQuestionMode(false);
          }}
        >
          Back to our adventure
        </button>
        <button
          disabled={locked}
          onClick={() => {
            setFullText(false);
            askQuestion();
          }}
        >
          Ask another question
        </button>
      </>
    ) : page.choices.length === 0 ? (
      <>
        <button
          disabled={locked || micBusy || mic.recording}
          onClick={() => {
            setQuestionMode(false);
            setFullText(false);
            setTyping(true);
          }}
        >
          Share my idea <Sparkles size={14} />
        </button>
        <button
          disabled={locked || micBusy || mic.recording}
          onClick={() => {
            setFullText(false);
            void tell(
              "I’m not sure. Please give me a couple of ideas to choose from.",
              "continue",
            );
          }}
        >
          Give me ideas
        </button>
      </>
    ) : (
      page.choices.slice(0, 2).map((choice, index) => (
        <button
          key={choice}
          disabled={locked}
          onClick={() => {
            setFullText(false);
            void tell(choice, "continue", index);
          }}
        >
          <span className="choice-number">{index + 1}</span> {choice}
        </button>
      ))
    ));

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
      ref={viewportRef}
      className={`immersive-app ${inStory ? "is-reading" : ""} ${reducedMotion ? "reduced-motion" : ""} ${profile.largeText ? "large-text" : ""} ${typing ? "is-typing" : ""} ${designPreview ? "is-design-preview" : ""}`}
    >
      <VideoStage
        storyActive={inStory && !designPreview}
        stream={orbis.stream}
        paused={paused}
        connecting={connecting}
        reducedMotion={reducedMotion}
        onLiveChange={stageLiveChange}
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
            {!designPreview && (
              <button
                aria-label="Call the storyteller"
                disabled={locked || micBusy || mic.recording}
                onClick={callStoryteller}
              >
                <Phone size={20} />
              </button>
            )}
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
                      ? "Opening your world. The voice will wait for the first live picture…"
                      : mic.transcribing ||
                          (previewStage === "transcribing" && designPreview)
                        ? "Turning a little voice into words…"
                        : "We’re making room for your idea…"}
                </div>
              )}
            {page && lastWords && !typing && !designPreview && (
              <div className="answer-receipt float-surface" role="status">
                <span>Your answer: “{lastWords}”</span>
                {!demo && !orbis.error && orbis.promptStatus && (
                  <small>{orbis.promptStatus}</small>
                )}
              </div>
            )}
            {page && (
              <StoryCaption
                key={pageIndex + (aside || page).narrative}
                text={(aside || page).narrative}
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
            {!page && !waitingForStory && (
              <div className="welcome-question story-topic-card float-surface">
                <span className="welcome-kicker">
                  A LITTLE VOICE. A WORLD OF WONDER.
                </span>
                <h1>What would you like your story to be about?</h1>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (canSubmit) respond(input);
                  }}
                >
                  <label className="sr-only" htmlFor="topic-idea">
                    Your story idea
                  </label>
                  <input
                    id="topic-idea"
                    value={input}
                    maxLength={1000}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="I want a story about…"
                    disabled={locked || micBusy || mic.recording}
                  />
                  <button className="start-story" disabled={!canSubmit}>
                    Begin my story <ArrowRight size={18} />
                  </button>
                </form>
                <button
                  className="topic-mic"
                  onClick={toggleMic}
                  disabled={locked || micBusy || !config}
                >
                  {mic.recording ? <AudioLines size={19} /> : <Mic size={19} />}
                  {mic.recording ? "Finish recording" : "Tell me your idea"}
                </button>
                {demo && (
                  <p className="sample-mode-note">
                    Sample mode: curated stories and browser voice. Live
                    storytelling needs the connected APIs.
                  </p>
                )}
              </div>
            )}
            {page && !typing && (
              <p className="story-question">{(aside || page).question}</p>
            )}
            {page && !typing && (
              <div className="immersive-choices" aria-label="Story choices">
                {storyActions}
              </div>
            )}
            {ending && !typing ? (
              <div className="story-ending">
                <button className="ending-button float-surface" onClick={reset}>
                  <Sparkles size={17} /> Dream a new story
                </button>
                <span>Keep the wonder. Rest a little.</span>
              </div>
            ) : page ? (
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
                            : "Answer out loud"
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
                          ? "Listening… pause when you’re done"
                          : mic.transcribing
                            ? "Turning your voice into words…"
                            : paused
                              ? "Resume to keep imagining"
                              : page.choices.length === 2
                                ? "Say one, two, or the option"
                                : "Tell me your idea"}
                    </span>
                    <button
                      ref={typeButtonRef}
                      className="type-instead"
                      disabled={locked || mic.recording || micBusy}
                      onClick={() => setTyping(true)}
                    >
                      Type instead <ArrowRight size={14} />
                    </button>
                    {!demo && (
                      <button
                        className="hands-free"
                        aria-pressed={handsFree}
                        disabled={locked || micBusy}
                        onClick={() => {
                          setHandsFree(!handsFree);
                          if (handsFree) mic.cancel();
                          else if (!speaking && !mic.recording) toggleMic();
                        }}
                      >
                        Hands-free answers {handsFree ? "on" : "off"}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="typing-prompt">
                      {questionMode
                        ? "What would you like to ask?"
                        : page
                          ? (aside || page).question
                          : "What would you like to imagine?"}
                    </p>
                    <form
                      className="floating-input float-surface"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (canSubmit) {
                          storyInputRef.current?.blur();
                          respond(input);
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
                            ? questionMode
                              ? "Your question…"
                              : "My idea is…"
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
                      disabled={locked || micBusy || mic.recording}
                      onClick={askQuestion}
                    >
                      <CircleHelp size={14} /> Ask a question
                    </button>
                    <button
                      disabled={locked || mic.recording || micBusy}
                      onClick={() =>
                        void tell(
                          "That feels scary. Make the story gentler and reassuring.",
                          "calm",
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
                          "continue",
                        )
                      }
                    >
                      <Sparkles size={14} /> More wonder
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
                      <Moon size={14} /> Cozy ending
                    </button>
                  </div>
                )}
                {page && !typing && (quietHelp || replays >= 2) && (
                  <div className="floating-reactions">
                    <button
                      disabled={locked || micBusy || mic.recording}
                      onClick={replay}
                    >
                      Hear it again
                    </button>
                    <button
                      disabled={locked || micBusy || mic.recording}
                      onClick={() =>
                        void tell(
                          "Please explain this page in simpler words.",
                          "simplify",
                        )
                      }
                    >
                      Simpler words
                    </button>
                  </div>
                )}
              </section>
            ) : null}
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
                ) : /narration|storyteller’s voice/i.test(error) && page ? (
                  <button onClick={replay}>Retry narration</button>
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
            pictureError={orbis.error}
            onPictureReady={orbis.pictureReady}
            preparePictures={prepareCallPictures}
            livePictures={!!config?.reactor}
            onScene={callScene}
            onPage={callPage}
            onLeave={() => setInCall(false)}
          />
        </Suspense>
      )}
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
              <p className="full-narrative">{(aside || page).narrative}</p>
              <p>{(aside || page).question}</p>
              <div className="story-choices">{storyActions}</div>
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
                Live read aloud uses an AI voice from ElevenLabs, with OpenAI
                narration when ElevenLabs is unavailable. The welcome background
                stays visible until live video has played its first frame. Demo
                mode uses curated stories instead of AI generation.
              </p>
              <p>
                Voice clips are sent to OpenAI for transcription; story text and
                preferences are sent for generation. Only scene descriptions go
                to Reactor. Narrated story pages go to ElevenLabs or OpenAI.
                This app keeps no recordings or saved profiles. Providers’ own
                data policies still apply.
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
                      detail:
                        config?.narration ||
                        config?.openai ||
                        config?.elevenlabs
                          ? "Natural AI narration from ElevenLabs or OpenAI."
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
                    <i
                      className={
                        config?.narration ||
                        config?.openai ||
                        config?.elevenlabs
                          ? "connected"
                          : ""
                      }
                    />{" "}
                    AI story narration
                  </span>
                  <small>
                    {config?.narration || config?.openai || config?.elevenlabs
                      ? "Ready"
                      : "Demo voice"}
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
                  and narrated story pages to ElevenLabs or OpenAI when enabled,
                  plus live call audio to ElevenLabs during a story call.
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
