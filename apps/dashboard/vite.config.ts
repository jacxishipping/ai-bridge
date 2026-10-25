import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], server: { port: 5173 },
  // The control plane runs on :8000; the dashboard talks to it directly.
  // In production, serve the built dashboard behind the same reverse proxy
  // and set VITE_API_URL to the proxied /api origin.
  define: { "import.meta.env.VITE_API_URL": JSON.stringify(process.env.VITE_API_URL || "http://127.0.0.1:8000") } });
