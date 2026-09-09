/**
 * Minimal runtime i18n. `t(key, params)` looks up the active locale, falls back
 * to English, then to the raw key. Templates carry `{token}` slots filled from
 * `params`. Locale is chosen once at load from `?lang=` or `navigator.language`.
 *
 * Add a language: create `./xx.ts` exporting the same keys as `./en.ts`, then
 * add it to `LOCALES` below. Missing keys fall through to English.
 */
import { en } from "./en";

const LOCALES: Record<string, Record<string, string>> = { en };

type Params = Record<string, string | number>;

function pickLocale(): string {
  const q = new URLSearchParams(location.search).get("lang");
  const tag = (q || navigator.language || "en").slice(0, 2).toLowerCase();
  return tag in LOCALES ? tag : "en";
}

const active = LOCALES[pickLocale()];

function interpolate(tpl: string, params: Params): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in params ? String(params[k]) : `{${k}}`,
  );
}

/** Look up `key`; returns "" if it exists in no locale (see `has`). */
export function t(key: string, params?: Params): string {
  const tpl = active[key] ?? en[key] ?? key;
  return params ? interpolate(tpl, params) : tpl;
}

/** True when `key` is defined in the active locale or English. */
export function has(key: string): boolean {
  return key in active || key in en;
}

/** Trivial count-based selector for call sites that need it. */
export function plural(n: number, one: string, other: string): string {
  return n === 1 ? one : other;
}
