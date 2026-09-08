import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { seasonArchivePlugin } from "./scripts/vite-plugin-season-archive";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "localhost",
    port: 8080,
    open: false, // Don't auto-open browser
  },
  build: {
    sourcemap: true, // Enable source maps for production
  },
  plugins: [
    react(),
    seasonArchivePlugin(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
