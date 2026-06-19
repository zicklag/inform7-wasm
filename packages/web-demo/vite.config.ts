import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  build: {
    target: "esnext",
  },
  // Optimize Monaco editor — it's large, pre-bundle it
  optimizeDeps: {
    include: ["monaco-editor"],
  },
});
