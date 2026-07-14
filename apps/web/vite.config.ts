import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Load VITE_* vars from the repo-root .env (shared with the API).
  envDir: "../..",
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Keep the rarely-changing framework libs in their own long-cached
        // chunk, separate from app code that ships on every deploy.
        manualChunks(id) {
          if (id.includes("node_modules/react-router") || id.includes("node_modules/@remix-run")) return "vendor-router";
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/") || id.includes("node_modules/scheduler")) return "vendor-react";
          return undefined;
        },
      },
    },
  },
});

