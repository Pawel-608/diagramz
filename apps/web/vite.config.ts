import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [react(), wasm()],
  server: {
    port: 3000,
    headers: {
      "Cache-Control": "no-store",
    },
    proxy: {
      "/api/v1/diagrams/": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        configure: (proxy) => {
          // Disable buffering so SSE events stream through
          proxy.on("proxyReq", (proxyReq, req) => {
            if (req.url?.endsWith("/events")) {
              proxyReq.setHeader("Cache-Control", "no-cache");
            }
          });
        },
      },
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "esnext",
  },
});
