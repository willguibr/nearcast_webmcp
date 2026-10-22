import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const commit = process.env.CI_COMMIT_SHA || process.env.BUILD_COMMIT || execFileSync("git", ["rev-parse", "HEAD"], {encoding:"utf8"}).trim();

// /api/* is same-origin in production (CloudFront routes it to API Gateway).
// Locally, proxy it to the backend dev server or a deployed API (VITE_API_PROXY_TARGET).
export default defineConfig(({ mode }) => ({
  plugins: [react(), { name: "release-metadata", apply: "build", closeBundle() { writeFileSync("dist/release.json", JSON.stringify({commit}) + "\n"); } }],
  define: { __APP_COMMIT__: JSON.stringify(commit) },
  server: {
    port: 5173,
    fs: { allow: [".."] },
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: mode !== "production",
    target: "es2022",
    rollupOptions: { output: { manualChunks: { maplibre: ["maplibre-gl"] } } },
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
}));
