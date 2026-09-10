/// <reference types="vitest/config" />
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

import { editorSave } from "./vite-plugin-editor-save";

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), editorSave()],
  // Pure-logic tests only (world-gen, scoring, level validation). Anything that
  // touches Pixi or the DOM is out of scope — see docs/roadmap/engineering-foundations.md §1.
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    environment: "node",
  },
  server: {
    port: 8080,
    open: true,
  },
  build: {
    // procgen.ts uses top-level await (Pixi `app.init`); es2020 can't emit it
    target: "es2022",
    rollupOptions: {
      // paths are resolved from the project root
      input: {
        main: "index.html", // the game
        preview: "preview.html", // a static object gallery for renderer tweaks
        tools: "tools.html", // procedural-generation viewer (Svelte)
        editor: "editor.html", // level editor (Svelte)
      },
    },
  },
});
