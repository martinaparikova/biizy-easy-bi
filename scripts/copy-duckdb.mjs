import { mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";

const target = join(process.cwd(), "public", "duckdb");
await mkdir(target, { recursive: true });
for (const file of ["duckdb-mvp.wasm", "duckdb-browser-mvp.worker.js", "duckdb-eh.wasm", "duckdb-browser-eh.worker.js"]) {
  await copyFile(join(process.cwd(), "node_modules", "@duckdb", "duckdb-wasm", "dist", file), join(target, file));
}
