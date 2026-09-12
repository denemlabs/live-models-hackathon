import { useEffect, type RefObject } from "react";

export function usePictureFrame(
  video: RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null,
  onReady: (stream: MediaStream) => void,
) {
  useEffect(() => {
    const player = video.current;
    if (!player || !stream) return;
    let cancelled = false;
    const ready = () => {
      if (
        !cancelled &&
        player.srcObject === stream &&
        player.videoWidth > 0 &&
        !player.paused
      )
        onReady(stream);
    };
    // This callback confirms a decoded frame was submitted for presentation.
    if (player.requestVideoFrameCallback) {
      const id = player.requestVideoFrameCallback(ready);
      return () => {
        cancelled = true;
        player.cancelVideoFrameCallback(id);
      };
    }
    player.addEventListener("playing", ready);
    if (player.readyState >= 2) ready();
    return () => {
      cancelled = true;
      player.removeEventListener("playing", ready);
    };
  }, [video, stream, onReady]);
}
