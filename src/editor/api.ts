/**
 * Talks to the dev-server endpoints added by `vite-plugin-editor-save.ts`.
 * All of this is dev-only; there is no production build path here.
 */
import { levelIds, loadLevelDef } from "../world/level/registry";
import type { LevelDef } from "../world/level/schema";

export async function listLevels(): Promise<string[]> {
  try {
    const r = await fetch("/__editor/levels");
    const j = (await r.json()) as { ids: string[] };
    return j.ids;
  } catch {
    return levelIds();
  }
}

/** the current on-disk level, parsed + normalised through the real loader */
export function readLevel(id: string): LevelDef {
  return loadLevelDef(id);
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export async function saveLevel(
  id: string,
  level: LevelDef,
): Promise<SaveResult> {
  try {
    const r = await fetch("/__editor/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, level }),
    });
    const j = (await r.json()) as SaveResult;
    return r.ok
      ? { ok: true }
      : { ok: false, error: j.error ?? `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function downloadJson(id: string, level: LevelDef): void {
  const blob = new Blob([JSON.stringify(level, null, 2) + "\n"], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${id}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
