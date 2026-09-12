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
  choiceVisualFor,
  finalizePage,
  StoryRequestSchema,
  demoPage,
  storyInstructions,
} from "../shared/story";
import { CallRequestSchema } from "../shared/storyteller";
import { createStoryteller } from "./storyteller";
import { createNarration } from "./narration";

export function createApp(env: NodeJS.ProcessEnv = process.env) {
  const app = express();
  app.disable("x-powered-by");
  // Railway terminates HTTPS at its reverse proxy. Trust that one hop only.
  if (env.RAILWAY_ENVIRONMENT_ID) app.set("trust proxy", 1);
  app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));
  const openai = env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 45000, maxRetries: 1 })
    : null;
  const storyteller = createStoryteller(env);
  const narrate = createNarration(env, openai);
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
      narration: !!(env.ELEVENLABS_API_KEY || openai),
      storyteller: !!storyteller,
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
    if (!env.ELEVENLABS_API_KEY && !openai) {
      res.status(503).json({ error: "AI narration is not configured." });
      return;
    }
    const controller = new AbortController();
    const disconnected = () => controller.abort();
    res.on("close", disconnected);
    try {
      const { audio, provider } = await narrate(
        parsed.data.text,
        controller.signal,
      );
      if (!controller.signal.aborted)
        res
          .set("X-Narration-Provider", provider)
          .type("audio/mpeg")
          .send(audio);
    } catch {
      if (!controller.signal.aborted)
        res.status(502).json({
          error: "Narration couldn’t connect. Please retry narration.",
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
          {
            role: "system",
            content: storyInstructions(data.profile, data.history),
          },
          {
            role: "user",
            content: JSON.stringify({
              topic: data.topic || data.input,
              previousPages: data.history,
              childSays: data.input,
              interaction: data.interaction,
              selectedChoiceVisual:
                data.interaction === "continue"
                  ? choiceVisualFor(
                      data.history.at(-1),
                      data.choiceIndex,
                      data.input,
                    )
                  : undefined,
              recentQuestions: data.conversation,
            }),
          },
        ],
        text: { format: zodTextFormat(GeneratedPageSchema, "storybook_page") },
        max_output_tokens: 1400,
      });
      const page = response.output_parsed;
      if (
        !page ||
        ![0, 2].includes(page.choices.length) ||
        page.choiceVisuals.length !== page.choices.length ||
        page.choices.some((choice) => !choice.trim())
      ) {
        res.status(422).json({
          error: "That page needs a little more magic. Try a different idea.",
        });
        return;
      }
      const finalPage = finalizePage(page, data);
      const checked = await openai.moderations.create({
        model: "omni-moderation-latest",
        input: JSON.stringify(finalPage),
      });
      if (checked.results.some((r) => r.flagged)) {
        res
          .status(422)
          .json({ error: "Let’s try a gentler turn for this story." });
        return;
      }
      res.json({ page: finalPage, mode: "live" });
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
  app.post("/api/storyteller/token", async (req, res) => {
    if (!storyteller) {
      res.status(503).json({
        error: "A story call needs an ElevenLabs API key.",
      });
      return;
    }
    const parsed = CallRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Please choose an age range first." });
      return;
    }
    try {
      res.json(await storyteller.session(parsed.data));
    } catch (error) {
      // Provisioning failures are a setup problem the developer has to see.
      console.error("Storyteller session failed:", error);
      res.status(502).json({
        error:
          "The storyteller couldn’t come to the call. Check your ElevenLabs key and plan, then try again.",
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
