import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import path from "node:path";
import packageJson from "./package.json";

function buildCommit() {
  try {
    const commit = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { cwd: __dirname, encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: __dirname, encoding: "utf8" }).trim();
    return `${commit}${dirty ? "-dirty" : ""}`;
  } catch {
    return "local";
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(packageJson.version),
    "import.meta.env.VITE_APP_BUILD": JSON.stringify(buildCommit()),
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5006",
        changeOrigin: true,
      },
    },
  },
});
