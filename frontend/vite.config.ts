import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api/* is same-origin in production (CloudFront routes it to API Gateway).
// Locally, proxy it to the backend dev server or a deployed API (VITE_API_PROXY_TARGET).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
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
