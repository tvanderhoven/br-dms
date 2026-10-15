import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Commit-Stand für die Versionsanzeige ("1.2.0 · be127dc"). Auf dem Host gibt es kein
// git – dort steht er in src/buildinfo.json, das die Deploy-Skripte vor der Übertragung
// schreiben. Lokal (npm run dev) wird git direkt gefragt.
function commitStand(): string {
  try {
    const info = JSON.parse(readFileSync(new URL("./src/buildinfo.json", import.meta.url), "utf-8"));
    if (info.commit) return String(info.commit);
  } catch { /* nicht vorhanden */ }
  try {
    const commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const geaendert = execSync("git status --porcelain", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return commit + (geaendert ? "+" : "");
  } catch {
    return "";
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  define: { __BUILD_COMMIT__: JSON.stringify(commitStand()) },
});
