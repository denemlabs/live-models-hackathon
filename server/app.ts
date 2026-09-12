import express from "express";
import { join } from "node:path";
import { VideoSessions, VideoSessionError } from "./videoSessions";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  GeneratedPageSchema,
  finalizePage,
  StoryRequestSchema,
  demoPage,
  storyInstructions,
} from "../shared/story";

export function createApp(env: NodeJS.ProcessEnv = process.env) {
  const app = express();
  app.disable("x-powered-by");
  // Railway terminates HTTPS at its reverse proxy. Trust that one hop only.
  if (env.RAILWAY_ENVIRONMENT_ID) app.set("trust proxy", 1);
  app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));
  const openai = env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 45000, maxRetries: 1 })
    : null;
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, res, next) => {
    const origin = req.get("origin");
    if (origin && origin !== `${req.protocol}://${req.get("host")}`) {
      res.status(403).json({ error: "Please use this app from its own page." });
      return;
    }
    next();
  });
  app.get("/api/config", (_req, res) =>
    res.json({
      openai: !!openai,
      reactor: !!env.REACTOR_API_KEY,
      elevenlabs: !!env.ELEVENLABS_API_KEY,
      accessCodeRequired: !!env.APP_ACCESS_CODE,
    }),
  );
  app.use("/api", (req, res, next) => {
    if (env.APP_ACCESS_CODE) {
      const actual = Buffer.from(req.get("x-access-code") ?? "");
      const expected = Buffer.from(env.APP_ACCESS_CODE);
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      ) {
        res
          .status(401)
          .json({ error: "Enter the demo access code in Grown-up settings." });
        return;
      }
    }
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 30,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "A little breather. Please try again in a minute." },
    }),
  );
  app.use(express.json({ limit: "64kb" }));
  app.post("/api/narrate", async (req, res) => {
    const parsed = z
      .object({ text: z.string().trim().min(1).max(2000) })
      .safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Choose a short story page to read aloud." });
      return;
    }
    if (!env.ELEVENLABS_API_KEY) {
      res
        .status(503)
        .json({ error: "ElevenLabs narration is not configured." });
      return;
    }
    const controller = new AbortController();
    const disconnected = () => controller.abort();
    res.on("close", disconnected);
    try {
      const voice = env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": env.ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: parsed.data.text,
            model_id: env.ELEVENLABS_MODEL || "eleven_flash_v2_5",
            voice_settings: { stability: 0.6, similarity_boost: 0.75 },
          }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(30000),
          ]),
        },
      );
      if (
        !response.ok ||
        !response.headers.get("content-type")?.startsWith("audio/")
      )
        throw new Error("Narration unavailable");
      // Short pages are buffered in memory for consistent browser playback.
      const audio = Buffer.from(await response.arrayBuffer());
      if (!audio.length) throw new Error("Empty narration");
      if (!controller.signal.aborted) res.type("audio/mpeg").send(audio);
    } catch {
      if (!controller.signal.aborted)
        res.status(502).json({
          error: "Narration couldn’t connect. You can use the browser voice.",
        });
    } finally {
      res.off("close", disconnected);
    }
  });
  app.post("/api/story", async (req, res) => {
    const parsed = StoryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Please give us a short story idea and a valid age range.",
      });
      return;
    }
    const data = parsed.data;
    if (data.demo) {
      res.json({ page: demoPage(data), mode: "demo" });
      return;
    }
    if (!openai) {
      res.status(503).json({
        error:
          "The story connection needs an OpenAI key. You can try the demo for now.",
      });
      return;
    }
    try {
      const moderation = await openai.moderations.create({
        model: "omni-moderation-latest",
        input: [data.input, data.topic].join("\n"),
      });
      if (moderation.results.some((r) => r.flagged)) {
        res.status(422).json({
          error:
            "Let’s choose a gentle adventure instead — perhaps a friendly animal or a magical garden.",
        });
        return;
      }
      const response = await openai.responses.parse({
        model: env.OPENAI_STORY_MODEL || "gpt-4.1-mini",
        store: false,
        input: [
          { role: "system", content: storyInstructions(data.profile) },
          {
            role: "user",
            content: JSON.stringify({
              topic: data.topic || data.input,
              previousPages: data.history,
              childSays: data.input,
              interaction: data.interaction,
              recentQuestions: data.conversation,
            }),
          },
        ],
        text: { format: zodTextFormat(GeneratedPageSchema, "storybook_page") },
        max_output_tokens: 1400,
      });
      const page = response.output_parsed;
      if (!page || page.choices.length !== 2) {
        res.status(422).json({
          error: "That page needs a little more magic. Try a different idea.",
        });
        return;
      }
      const checked = await openai.moderations.create({
        model: "omni-moderation-latest",
        input: JSON.stringify(page),
      });
      if (checked.results.some((r) => r.flagged)) {
        res
          .status(422)
          .json({ error: "Let’s try a gentler turn for this story." });
        return;
      }
      res.json({ page: finalizePage(page, data), mode: "live" });
    } catch {
      res.status(502).json({
        error:
          "The storyteller could not connect. Check the OpenAI key and model access, then try again.",
      });
    }
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 },
  });
  app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
    if (!openai) {
      res.status(503).json({
        error: "Voice needs an OpenAI key. You can type your idea instead.",
      });
      return;
    }
    const file = req.file;
    const extensions: Record<string, string> = {
      "audio/webm": "webm",
      "video/webm": "webm",
      "audio/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/ogg": "ogg",
    };
    const extension = file && extensions[file.mimetype.split(";")[0]];
    if (!file || !extension || file.size < 100) {
      res.status(400).json({ error: "Please record a short voice message." });
      return;
    }
    try {
      const result = await openai.audio.transcriptions.create({
        file: await toFile(file.buffer, `voice.${extension}`, {
          type: file.mimetype,
        }),
        model: env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
        response_format: "json",
      });
      res.json({ text: result.text.slice(0, 1000) });
    } catch {
      res.status(502).json({
        error: "We couldn’t hear that just now. Please try again or type it.",
      });
    }
  });
  const sessions = new VideoSessions(
    env,
    env.VIDEO_SESSION_STORE ||
      join(env.RAILWAY_VOLUME_MOUNT_PATH || ".data", "video-session.json"),
  );
  app.locals.videoSessions = sessions;
  app.post("/api/reactor/session", async (_req, res) => {
    let disconnected = false;
    let leaseId: string | undefined;
    res.on("close", () => {
      if (!res.writableEnded) {
        disconnected = true;
        if (leaseId) void sessions.release(leaseId).catch(() => {});
      }
    });
    try {
      const lease = await sessions.open();
      leaseId = lease.leaseId;
      if (disconnected) {
        await sessions.release(lease.leaseId);
        return;
      }
      res.json({
        leaseId: lease.leaseId,
        sessionId: lease.sessionId,
        jwt: lease.jwt,
        model: lease.model,
        provider: lease.provider,
      });
    } catch (e) {
      if (!disconnected)
        res.status(e instanceof VideoSessionError ? e.status : 502).json({
          error:
            e instanceof VideoSessionError
              ? e.message
              : "The video connection could not be prepared. Please retry.",
        });
    }
  });
  for (const action of ["heartbeat", "release"] as const) {
    app.post(`/api/reactor/session/${action}`, async (req, res) => {
      const parsed = z
        .object({ leaseId: z.string().uuid() })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid video session." });
        return;
      }
      try {
        const active =
          action === "heartbeat"
            ? await sessions.heartbeat(parsed.data.leaseId)
            : await sessions.release(parsed.data.leaseId);
        res.json({ active: action === "heartbeat" ? active : false });
      } catch {
        res.status(502).json({
          error:
            "Video cleanup could not complete. The next connection will retry it.",
        });
      }
    });
  }
  app.post("/api/reactor/token", async (req, res) => {
    const selected = z
      .object({ provider: z.enum(["primary", "backup"]).default("primary") })
      .safeParse(req.body ?? {});
    if (!selected.success) {
      res.status(400).json({ error: "Choose a valid video connection." });
      return;
    }
    const reactorKey =
      selected.data.provider === "backup"
        ? env.REACTOR_API_KEY_BACKUP
        : env.REACTOR_API_KEY;
    if (!reactorKey) {
      res.status(503).json({ error: "Live pictures need a Reactor API key." });
      return;
    }
    const model = env.REACTOR_MODEL || "reactor/visko-orbis-stable";
    try {
      const response = await fetch("https://api.reactor.inc/tokens", {
        method: "POST",
        headers: {
          "Reactor-API-Key": reactorKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expires_after: 600,
          authorization_details: [
            {
              type: "session",
              resources: { models: { match: [model] } },
              constraints: {
                max_sessions: 1,
                max_session_duration_seconds: 480,
              },
            },
          ],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Token failed");
      const token = (await response.json()) as { jwt?: string };
      if (!token.jwt) throw new Error("Missing token");
      res.json({
        jwt: token.jwt,
        model,
        backupAvailable: !!env.REACTOR_API_KEY_BACKUP,
      });
    } catch {
      res.status(502).json({
        error:
          "The live pictures couldn’t connect. Check your Reactor key and Orbis access.",
      });
    }
  });
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "That route does not exist." });
  });
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status = err instanceof multer.MulterError ? 413 : 400;
      res.status(status).json({
        error:
          status === 413
            ? "Keep voice messages under 30 seconds and 8 MB."
            : "We couldn’t read that request. Please try again.",
      });
    },
  );
  return app;
}
