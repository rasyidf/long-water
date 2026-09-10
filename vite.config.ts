import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 8080,
    open: true,
  },
  build: {
    rollupOptions: {
      // paths are resolved from the project root
      input: {
        main: "index.html", // the game
        preview: "preview.html", // a static object gallery for renderer tweaks
        procgen: "procgen.html", // live single-entity procgen designer
      },
    },
  },
});
