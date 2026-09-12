import express from "express";

// Local development shares production's API and session registry. No API keys
// need to be copied to disk, and localhost cannot create an untracked video.
export function developmentApi(origin: string) {
  const upstream = new URL(origin);
  if (upstream.protocol !== "https:")
    throw new Error("DEV_API_ORIGIN must use HTTPS");
  const router = express.Router();
  router.use(express.raw({ type: () => true, limit: "9mb" }));
  router.use(async (req, res) => {
    const browserOrigin = req.get("origin");
    let sameOrigin = !browserOrigin;
    try {
      if (browserOrigin)
        sameOrigin = new URL(browserOrigin).host === req.get("host");
    } catch {
      /* Invalid and opaque origins are rejected. */
    }
    if (!sameOrigin) {
      res.status(403).json({ error: "Open the app in this browser first." });
      return;
    }
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) abort.abort();
    });
    try {
      const headers: Record<string, string> = {};
      for (const name of ["content-type", "x-access-code"]) {
        const value = req.get(name);
        if (value) headers[name] = value;
      }
      const response = await fetch(new URL(req.originalUrl, upstream), {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(180000)]),
      });
      const type = response.headers.get("content-type");
      if (type) res.setHeader("content-type", type);
      res
        .status(response.status)
        .send(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!abort.signal.aborted)
        res.status(502).json({
          error: "The live story server could not connect. Please try again.",
        });
    }
  });
  return router;
}
