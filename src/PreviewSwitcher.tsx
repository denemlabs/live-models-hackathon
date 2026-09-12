import { useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { previewStages, type PreviewStage } from "./storyPreview";

export default function PreviewSwitcher({
  stage,
  status,
  onChange,
}: {
  stage: PreviewStage;
  status: string;
  onChange: (stage: PreviewStage) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <div
      className="preview-switcher"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          toggle.current?.focus({ preventScroll: true });
        }
      }}
    >
      <button
        ref={toggle}
        className="preview-toggle float-surface"
        aria-expanded={open}
        aria-controls="preview-stages"
        onClick={() => setOpen(!open)}
      >
        <span>
          Design preview <ChevronDown size={13} />
        </span>
        <small>Saved video · no live AI</small>
      </button>
      <span className="preview-state" role="status">
        {status}
      </span>
      {open && (
        <nav
          id="preview-stages"
          className="preview-menu float-surface"
          aria-label="Preview stages"
        >
          <p>Review the next story stages</p>
          {previewStages.map(([value, label]) => (
            <button
              key={value}
              aria-pressed={stage === value}
              onClick={() => {
                onChange(value);
                setOpen(false);
                toggle.current?.focus({ preventScroll: true });
              }}
            >
              {label}
              {stage === value && <Check size={14} />}
            </button>
          ))}
          <a href="/">Leave design preview</a>
        </nav>
      )}
    </div>
  );
}
