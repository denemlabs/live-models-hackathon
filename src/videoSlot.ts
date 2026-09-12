// Web Locks are scoped to this browser and origin. Reactor enforces the
// account-wide limit across other browsers, localhost, and the sandbox.
export function acquireVideoSlot(
  locks: Pick<LockManager, "request">,
): Promise<() => void> {
  return new Promise((resolve, reject) => {
    void locks
      .request("little-wonder-orbis", { ifAvailable: true }, async (lock) => {
        if (!lock) {
          reject(
            Object.assign(new Error("Another tab is using live video"), {
              code: "VIDEO_IN_ANOTHER_TAB",
            }),
          );
          return;
        }
        await new Promise<void>((release) => resolve(release));
      })
      .catch(reject);
  });
}
