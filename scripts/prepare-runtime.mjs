import { mkdir, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const sdk = dirname(fileURLToPath(import.meta.resolve("@reactor-team/js-sdk")));
await mkdir("public/reactor-runtime", { recursive: true });
for (const file of ["reactor_wasm.js", "reactor_wasm_bg.wasm"]) {
  await copyFile(
    resolve(sdk, "wasm", file),
    resolve("public/reactor-runtime", file),
  );
}
