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
      ) {
        onReady(stream);
        return true;
      }
      return false;
    };
    // This callback confirms a decoded frame was submitted for presentation.
    if (player.requestVideoFrameCallback) {
      let id: number;
      const frame = () => {
        if (!cancelled && !ready())
          id = player.requestVideoFrameCallback(frame);
      };
      id = player.requestVideoFrameCallback(frame);
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
