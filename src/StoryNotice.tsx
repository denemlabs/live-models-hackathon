import { AlertTriangle, ChevronDown, X } from "lucide-react";

export default function StoryNotice({
  message,
  video,
  paused,
  onRetry,
  retryLabel,
  onDismiss,
}: {
  message: string;
  video: boolean;
  paused: boolean;
  onRetry?: () => void;
  retryLabel?: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="story-notice" role="alert">
      <details>
        <summary>
          <AlertTriangle size={15} />
          <span>
            {video ? "Live video unavailable" : "Something needs attention"}
          </span>
          <ChevronDown size={14} />
        </summary>
        <p className="notice-detail">{message}</p>
      </details>
      {onRetry && (
        <button
          disabled={paused}
          aria-label={retryLabel || (video ? "Retry live video" : "Retry")}
          onClick={onRetry}
        >
          Retry
        </button>
      )}
      {onDismiss && (
        <button aria-label="Dismiss message" onClick={onDismiss}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
