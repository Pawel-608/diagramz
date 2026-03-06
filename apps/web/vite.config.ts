import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [react(), wasm()],
  server: {
    port: 3000,
    proxy: {
      "/api/v1/diagrams/": {
        target: "http://localhost:3001",
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
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "esnext",
  },
});
