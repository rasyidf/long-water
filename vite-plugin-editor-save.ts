/**
 * Dev-only bridge for the level editor (`editor.html`). Adds two endpoints to
 * the Vite dev server:
 *
 *   GET  /__editor/levels        → { ids: string[] }
 *   POST /__editor/save  {id,level} → { ok: true } | { error: string }  (422 on bad level)
 *
 * `save` runs the level through the real `parseLevel` validator before it
 * touches disk, then writes `src/world/levels/<id>.json` pretty-printed. Only
 * `configureServer` is implemented, so none of this exists in a production build.
 */
import { readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Plugin } from "vite";

import { parseLevel } from "./src/world/level/validate";

const LEVELS_DIR = join(process.cwd(), "src/world/levels");
const ID_RE = /^[a-z0-9-]+$/;

function readBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

export function editorSave(): Plugin {
  return {
    name: "long-water:editor-save",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__editor/levels", (_req, res) => {
        const ids = readdirSync(LEVELS_DIR)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(/\.json$/, ""));
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ids }));
      });

      server.middlewares.use("/__editor/save", (req, res) => {
        const send = (code: number, body: unknown): void => {
          res.statusCode = code;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        if (req.method !== "POST") return send(405, { error: "POST only" });

        readBody(req)
          .then(async (raw) => {
            const { id, level } = JSON.parse(raw) as {
              id?: string;
              level?: unknown;
            };
            if (!id || !ID_RE.test(id))
              return send(400, { error: `bad level id "${id ?? ""}"` });
            try {
              parseLevel(level, id);
            } catch (e) {
              return send(422, { error: (e as Error).message });
            }
            await writeFile(
              join(LEVELS_DIR, `${id}.json`),
              JSON.stringify(level, null, 2) + "\n",
            );
            send(200, { ok: true });
          })
          .catch((e: unknown) => send(500, { error: String(e) }));
      });
    },
  };
}
