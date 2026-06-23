import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Load VITE_* vars from the repo-root .env (shared with the API).
  envDir: "../..",
  server: { port: 5173 },
});
