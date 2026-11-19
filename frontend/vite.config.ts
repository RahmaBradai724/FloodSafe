import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend (uvicorn app.main_v2:app, port 8000) is reached through /api in development.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") },
    },
  },
});
