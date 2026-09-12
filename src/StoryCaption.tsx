import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Pause, Play } from "lucide-react";
import { captionCues } from "./mediaLifecycle";

export default function StoryCaption({
  text,
  paused,
  preview,
  hidden,
  onFullText,
}: {
  text: string;
  paused: boolean;
  preview: boolean;
  hidden: boolean;
  onFullText: () => void;
}) {
  const cues = captionCues(text);
  const [cue, setCue] = useState(0);
  const [auto, setAuto] = useState(false);
  const currentCue = cues[cue] ?? "";
  const atEnd = cue >= cues.length - 1;
  const running = auto && !atEnd;
  useEffect(() => {
    if (!preview || !auto || paused || cue >= cues.length - 1) return;
    // Visual preview only. No fabricated audio timecodes or word highlighting.
    const timer = setTimeout(
      () => setCue((n) => n + 1),
      Math.max(2600, currentCue.split(/\s+/).length * 420),
    );
    return () => clearTimeout(timer);
  }, [auto, cue, cues.length, currentCue, paused, preview]);
  if (!cues.length) return null;
  if (!preview)
    return (
      <section
        className="story-caption story-page-text"
        aria-label="Story text"
        hidden={hidden}
      >
        <p className="narrated-page">{text}</p>
        <button className="read-full" onClick={onFullText}>
          <BookOpen size={14} /> Read story
        </button>
      </section>
    );
  return (
    <section
      className="story-caption"
      aria-label="Story subtitles"
      hidden={hidden}
    >
      <p className="caption-text" aria-live={auto ? "off" : "polite"}>
        <span key={cue}>{currentCue}</span>
      </p>
      <nav className="sentence-navigation" aria-label="Subtitle navigation">
        <button
          aria-label="Previous subtitle"
          disabled={cue === 0}
          onClick={() => {
            setAuto(false);
            setCue((n) => n - 1);
          }}
        >
          <ArrowLeft size={16} />
        </button>
        <span className="caption-counter">
          {cue + 1} / {cues.length}
        </span>
        <button
          aria-label="Next subtitle"
          disabled={cue >= cues.length - 1}
          onClick={() => {
            setAuto(false);
            setCue((n) => n + 1);
          }}
        >
          <ArrowRight size={16} />
        </button>
        {preview && (
          <button
            className="caption-autoplay"
            aria-label={
              running ? "Pause caption preview" : "Play caption preview"
            }
            aria-pressed={running}
            onClick={() => {
              if (atEnd) setCue(0);
              setAuto(!running);
            }}
          >
            {running ? <Pause size={14} /> : <Play size={14} />} Preview
          </button>
        )}
        <button className="read-full" onClick={onFullText}>
          <BookOpen size={14} /> Read story
        </button>
      </nav>
      {preview && (
        <p className="caption-timing">Timed preview only · not audio-synced</p>
      )}
    </section>
  );
}
