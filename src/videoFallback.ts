export type VideoProvider = "primary" | "backup";

// Try the separately provisioned backup account once, only for capacity errors.
export async function connectWithBackup<T>(
  attempt: (provider: VideoProvider) => Promise<T>,
  backupAvailable: () => boolean,
  signal: AbortSignal,
  onFallback: () => void,
): Promise<T> {
  try {
    return await attempt("primary");
  } catch (cause) {
    signal.throwIfAborted();
    const code =
      cause && typeof cause === "object"
        ? (cause as { code?: unknown }).code
        : undefined;
    if (
      !backupAvailable() ||
      (code !== "RATE_LIMITED" && code !== "VIDEO_IN_ANOTHER_TAB")
    )
      throw cause;
    onFallback();
    return attempt("backup");
  }
}
