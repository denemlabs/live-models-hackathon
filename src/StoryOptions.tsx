import { useEffect, useId, useRef, type ReactNode } from "react";
import { ChevronUp, Sparkles } from "lucide-react";

/** A disclosure, not a menu: its choices remain ordinary keyboard-accessible buttons. */
export default function StoryOptions({
  open,
  onOpenChange,
  disabled,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenChange(false);
      trigger.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onOpenChange]);
  return (
    <div className="story-options" ref={root}>
      <button
        ref={trigger}
        className="story-options-trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onOpenChange(!open)}
      >
        <Sparkles size={16} /> What next? <ChevronUp size={14} />
      </button>
      {open && (
        <div
          id={id}
          className="story-options-panel float-surface"
          role="region"
          aria-label="Story options"
          onClick={(event) => {
            const action = (event.target as Element).closest("button");
            if (!action || action.disabled) return;
            // Restore focus before an action's new input/dialog claims it.
            trigger.current?.focus({ preventScroll: true });
            onOpenChange(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
