import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// SDK 3.0.2 leaves its WASM import to the browser. Give that import a stable
// public URL in development and production rather than a bundled relative URL.
export default defineConfig({
  plugins: [
    {
      name: "reactor-runtime-path",
      enforce: "pre",
      transform(code, id) {
        if (id.includes("@reactor-team/js-sdk") && id.endsWith(".js"))
          return code.replace(
            '"./wasm/reactor_wasm.js"',
            '"/reactor-runtime/reactor_wasm.js"',
          );
      },
    },
    react(),
  ],
  optimizeDeps: {
    exclude: ["@reactor-team/js-sdk"],
    include: ["@reactor-team/js-sdk > awaitqueue"],
  },
  server: { hmr: { port: Number(process.env.HMR_PORT || 24678) } },
});
