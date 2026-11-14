import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Three modes:
//   (default)          dev harness served from index.html
//   --mode content     content script, single IIFE file (MV3 content scripts cannot be ES modules)
//   --mode background  service worker, ES module
//   --mode popup       toolbar popup
export default defineConfig(({ mode }) => {
  const production = { "process.env.NODE_ENV": JSON.stringify("production") };

  if (mode === "content") {
    return {
      plugins: [react()],
      define: production,
      publicDir: "public",
      build: {
        outDir: "dist",
        emptyOutDir: true,
        lib: {
          entry: "src/content/index.ts",
          formats: ["iife"],
          name: "LexisFlow",
          fileName: () => "content.js",
        },
      },
    };
  }

  if (mode === "popup") {
    return {
      base: "./",
      plugins: [react()],
      define: production,
      publicDir: false,
      build: {
        outDir: "dist",
        emptyOutDir: false,
        rollupOptions: { input: "popup.html" },
      },
    };
  }

  if (mode === "background") {
    return {
      define: production,
      publicDir: false,
      build: {
        outDir: "dist",
        emptyOutDir: false,
        lib: {
          entry: "src/background/background.ts",
          formats: ["es"],
          fileName: () => "background.js",
        },
      },
    };
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
    },
  };
});
