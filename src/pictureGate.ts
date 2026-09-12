// A transport connection or a generation acknowledgement is not a visible frame.
// Old waiters must be cancelled when a story is replaced, never released later.
export class PictureGate {
  private result = Promise.resolve(false);
  private resolve: ((ready: boolean) => void) | null = null;
  begin() {
    this.cancel();
    this.result = new Promise<boolean>((resolve) => {
      this.resolve = resolve;
    });
  }
  ready() {
    this.resolve?.(true);
    this.resolve = null;
  }
  cancel() {
    this.resolve?.(false);
    this.resolve = null;
    this.result = Promise.resolve(false);
  }
  wait() {
    return this.result;
  }
}

export async function playWhenReady(
  ready: Promise<boolean>,
  isCurrent: () => boolean,
  play: () => void | Promise<void>,
) {
  if ((await ready) && isCurrent()) await play();
}
