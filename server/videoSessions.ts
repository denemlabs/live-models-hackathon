import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type VideoLease = {
  leaseId: string;
  sessionId: string;
  jwt: string;
  provider: "primary" | "backup";
  model: string;
  lastSeen: number;
  expiresAt: number;
};
export class VideoSessionError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
const API = "https://api.reactor.inc";
const headers = (jwt: string) => ({
  Authorization: `Bearer ${jwt}`,
  "Content-Type": "application/json",
  "Reactor-API-Version": "1",
  "Reactor-API-Accept-Version": "1",
});

// One Railway service instance and a persistent volume own session lifecycle.
// Browsers adopt sessions; their disappearance cannot lose the cleanup handle.
export class VideoSessions {
  private active: VideoLease | null = null;
  private loaded = false;
  private preferred: VideoLease["provider"] | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private env: NodeJS.ProcessEnv,
    private file: string,
    private request: typeof fetch = fetch,
    private now = Date.now,
  ) {}
  private serial<T>(job: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      await this.load();
      return job();
    });
    this.queue = result.catch(() => {});
    return result;
  }
  private async load() {
    if (this.loaded) return;
    try {
      this.active = JSON.parse(await readFile(this.file, "utf8"));
      this.preferred = this.active?.provider ?? null;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    this.loaded = true;
  }
  private async save() {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file + ".tmp", JSON.stringify(this.active), {
      mode: 0o600,
    });
    await rename(this.file + ".tmp", this.file);
  }
  private async end() {
    const old = this.active;
    if (!old) return;
    // Reactor enforces this cap even if the browser and server disappear.
    if (old.expiresAt > this.now()) {
      const response = await this.request(
        `${API}/sessions/${encodeURIComponent(old.sessionId)}`,
        {
          method: "DELETE",
          headers: headers(old.jwt),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok && response.status !== 404 && response.status !== 410)
        throw new VideoSessionError(
          "The previous video is still closing. Please try again shortly.",
        );
    }
    if (old.expiresAt > this.now()) {
      let closed = false;
      for (let poll = 0; poll < 20; poll++) {
        const stateResponse = await this.request(
          `${API}/sessions/${encodeURIComponent(old.sessionId)}`,
          {
            headers: headers(old.jwt),
            signal: AbortSignal.timeout(10000),
          },
        );
        if (stateResponse.status === 404 || stateResponse.status === 410) {
          closed = true;
          break;
        }
        if (!stateResponse.ok)
          throw new VideoSessionError(
            "The previous video is still closing. Please try again shortly.",
          );
        const state = (await stateResponse.json()) as { state?: string };
        if (state.state === "CLOSED" || state.state === "INACTIVE") {
          closed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!closed)
        throw new VideoSessionError(
          "Reactor is still releasing the previous video. Reconnect shortly to finish the takeover.",
        );
    }
    this.active = null;
    await this.save();
  }
  open() {
    return this.serial(async () => {
      const previousProvider = this.active?.provider ?? this.preferred;
      await this.end();
      const model = this.env.REACTOR_MODEL || "reactor/visko-orbis-stable";
      const providers: VideoLease["provider"][] =
        previousProvider === "backup"
          ? ["backup", "primary"]
          : ["primary", "backup"];
      for (const provider of providers) {
        const key =
          provider === "primary"
            ? this.env.REACTOR_API_KEY
            : this.env.REACTOR_API_KEY_BACKUP;
        if (!key) continue;
        const tokenResponse = await this.request(`${API}/tokens`, {
          method: "POST",
          headers: {
            "Reactor-API-Key": key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            expires_after: 2400,
            authorization_details: [
              {
                type: "session",
                resources: { models: { match: [model] } },
                constraints: {
                  max_sessions: 1,
                  max_session_duration_seconds: 1800,
                },
              },
            ],
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!tokenResponse.ok)
          throw new VideoSessionError(
            "The video account could not authenticate.",
          );
        const { jwt } = (await tokenResponse.json()) as { jwt?: string };
        if (!jwt)
          throw new VideoSessionError(
            "The video account did not return a session token.",
          );
        // A just-terminated GPU session may take a moment to release its quota.
        const attempts = provider === previousProvider ? 3 : 1;
        for (let attempt = 0; attempt < attempts; attempt++) {
          const response = await this.request(`${API}/sessions`, {
            method: "POST",
            headers: headers(jwt),
            body: JSON.stringify({
              model: { name: model },
              client_info: { sdk_type: "js", sdk_version: "3.0.2" },
              supported_transports: [{ protocol: "webrtc", version: "1" }],
            }),
            signal: AbortSignal.timeout(20000),
          });
          if (response.status === 429) {
            if (attempt < attempts - 1) {
              const retry = Number(response.headers.get("retry-after"));
              await new Promise((resolve) =>
                setTimeout(
                  resolve,
                  Number.isFinite(retry) && retry > 0
                    ? Math.min(retry * 1000, 10000)
                    : 4000,
                ),
              );
              continue;
            }
            break;
          }
          if (!response.ok)
            throw new VideoSessionError(
              "Reactor could not start the new video session.",
            );
          const data = (await response.json()) as { session_id?: string };
          if (!data.session_id)
            throw new VideoSessionError(
              "Reactor did not return a video session identifier.",
            );
          this.active = {
            leaseId: randomUUID(),
            sessionId: data.session_id,
            jwt,
            provider,
            model,
            lastSeen: this.now(),
            expiresAt: this.now() + 1800_000,
          };
          this.preferred = provider;
          try {
            await this.save();
          } catch (e) {
            await this.end();
            throw e;
          }
          return { ...this.active };
        }
      }
      throw new VideoSessionError(
        "Reactor still reports an occupied account. Older sessions created before server-managed cleanup need to be cleared once in Reactor. New Little Wonder sessions are replaced automatically.",
        503,
      );
    });
  }
  heartbeat(leaseId: string) {
    return this.serial(async () => {
      if (!this.active || this.active.leaseId !== leaseId) return false;
      this.active.lastSeen = this.now();
      await this.save();
      return true;
    });
  }
  release(leaseId: string) {
    return this.serial(async () => {
      if (this.active?.leaseId === leaseId) await this.end();
    });
  }
  reap() {
    return this.serial(async () => {
      if (
        this.active &&
        (this.now() - this.active.lastSeen > 120_000 ||
          this.now() >= this.active.expiresAt)
      )
        await this.end();
    });
  }
}
