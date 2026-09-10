import js from "@eslint/js";
import prettier from "eslint-plugin-prettier/recommended";
import svelte from "eslint-plugin-svelte";
import tseslint from "typescript-eslint";

import svelteConfig from "./svelte.config.js";

export default tseslint.config(
  { ignores: ["dist", ".svelte-kit"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {},
  },
  {
    extends: [...svelte.configs.recommended, prettier],
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        parser: tseslint.parser,
        svelteConfig,
      },
    },
    rules: {
      // the tools drive Pixi imperatively from onMount; reassigning imported
      // param objects and using non-reactive locals in effects is intentional
      "svelte/no-unused-svelte-ignore": "off",
    },
  },
);
