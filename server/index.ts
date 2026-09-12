import "dotenv/config";
import express from "express";
import { resolve } from "node:path";
import { createApp } from "./app";
const app = createApp();
const cleanup = setInterval(() => {
  void app.locals.videoSessions
    .reap()
    .catch(() => console.warn("Video session cleanup will retry"));
}, 30000);
cleanup.unref();
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
const host =
  process.env.HOST ||
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
app.listen(port, host, () =>
  console.log(`Little Wonder is ready at http://localhost:${port}`),
);
