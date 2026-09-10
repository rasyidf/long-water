import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  // <script lang="ts"> support; no other preprocessing needed
  preprocess: vitePreprocess(),
};
