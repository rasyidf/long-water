<script lang="ts">
  import { TILES } from "../config/tiles";
  import { SceneHost } from "../tools/SceneHost";
  import PixiStage from "../tools/lib/PixiStage.svelte";
  import { parseLevel } from "../world/level/validate";
  import type { LevelDef, SpawnDirective } from "../world/level/schema";

  import { downloadJson, listLevels, readLevel, saveLevel } from "./api";
  import { blankSpawn, SPAWN_KINDS } from "./fieldSpecs";
  import SpawnEditor from "./SpawnEditor.svelte";

  let ids = $state<string[]>([]);
  let id = $state("crossing");
  let seed = $state(20260907);
  let level = $state<LevelDef>(readLevel("crossing"));
  let dirty = $state(false);
  let saveMsg = $state("");
  let tab = $state<"leg" | "zones" | "terrain" | "spawns">("zones");

  let host = $state<SceneHost | undefined>();
  let lit = $state(true);
  let reloadTimer = 0;

  listLevels().then((list) => {
    ids = list;
    if (!list.includes(id) && list.length) load(list[0]);
  });

  function load(next: string) {
    id = next;
    try {
      level = readLevel(next);
    } catch (e) {
      saveMsg = `load failed: ${(e as Error).message}`;
      return;
    }
    seed = level.seed ?? 20260907;
    dirty = false;
    saveMsg = "";
  }

  function touch() {
    dirty = true;
    saveMsg = "";
  }

  function mount(el: HTMLDivElement) {
    const h = new SceneHost(el);
    h.init().then(() => (host = h));
    return () => h.dispose();
  }

  // live preview — rebuild the scene from a plain snapshot on any edit
  $effect(() => {
    const snap = $state.snapshot(level) as LevelDef;
    const sd = seed;
    const light = lit;
    if (!host) return;
    clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(() => {
      try {
        host?.load(snap, sd, {
          light,
          whale: { x: snap.leg.startX + 400, y: 700 },
          focus: {
            x: snap.leg.startX + 2000,
            y: 1200,
            scale: 0.08,
          },
        });
      } catch (e) {
        saveMsg = `preview error: ${(e as Error).message}`;
      }
    }, 180);
  });

  const validation = $derived.by(() => {
    try {
      parseLevel($state.snapshot(level), id);
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  });

  async function doSave() {
    const res = await saveLevel(id, $state.snapshot(level) as LevelDef);
    if (res.ok) {
      dirty = false;
      saveMsg = `saved src/world/levels/${id}.json`;
    } else {
      saveMsg = `save rejected: ${res.error}`;
    }
  }

  function copyJson() {
    navigator.clipboard.writeText(
      JSON.stringify($state.snapshot(level), null, 2) + "\n",
    );
    saveMsg = "copied JSON to clipboard";
  }

  // ── zone / spawn mutations ─────────────────────────────────────────────
  function addZone() {
    const lastX = level.zones.at(-1)?.x ?? 0;
    level.zones.push({
      x: lastX + 20000,
      id: "zone",
      shelf: 0x143f52,
      deep: 0x08192a,
      tempC: 12,
    });
    touch();
  }
  function hex(n: number): string {
    return "#" + (n >>> 0).toString(16).padStart(6, "0").slice(-6);
  }
  function setHex(i: number, field: "shelf" | "deep", v: string) {
    level.zones[i][field] = parseInt(v.replace(/^#/, ""), 16);
    touch();
  }

  let newKind = $state<(typeof SPAWN_KINDS)[number]>("krill");
  let newMode = $state<"scatter" | "place">("scatter");
  function addSpawn() {
    level.spawns.push(blankSpawn(newKind, newMode) as SpawnDirective);
    touch();
  }
  function moveSpawn(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= level.spawns.length) return;
    [level.spawns[i], level.spawns[j]] = [level.spawns[j], level.spawns[i]];
    touch();
  }
</script>

<div class="bar">
  <strong>Level Editor</strong>
  <select bind:value={id} onchange={(e) => load(e.currentTarget.value)}>
    {#each ids as lid (lid)}<option value={lid}>{lid}</option>{/each}
  </select>
  <label>seed <input type="number" bind:value={seed} oninput={touch} /></label>
  <label><input type="checkbox" bind:checked={lit} /> light</label>
  <span class="sp"></span>
  {#if validation}<span class="bad" title={validation}>⚠ invalid</span>{/if}
  {#if dirty}<span class="dot" title="unsaved changes">●</span>{/if}
  <button type="button" disabled={!!validation} onclick={doSave}>Save</button>
  <button
    type="button"
    onclick={() => downloadJson(id, $state.snapshot(level) as LevelDef)}
    >Download</button
  >
  <button type="button" onclick={copyJson}>Copy</button>
  <a class="btn" href={`/?level=${id}&seed=${seed}`} target="_blank"
    >Open in game</a
  >
</div>

{#if saveMsg}<div class="msg">{saveMsg}</div>{/if}
{#if validation}<div class="msg bad">{validation}</div>{/if}

<div class="cols">
  <PixiStage {mount} />

  <aside>
    <nav>
      {#each ["leg", "zones", "terrain", "spawns"] as t (t)}
        <button
          type="button"
          class:on={tab === t}
          onclick={() => (tab = t as typeof tab)}>{t}</button
        >
      {/each}
    </nav>

    {#if tab === "leg"}
      <label class="f"
        ><span>startX</span><input
          type="number"
          bind:value={level.leg.startX}
          oninput={touch}
        /></label
      >
      <label class="f"
        ><span>finishX</span><input
          type="number"
          bind:value={level.leg.finishX}
          oninput={touch}
        /></label
      >
    {:else if tab === "zones"}
      {#each level.zones as zone, i (i)}
        <div class="zone">
          <div class="zhead">
            <input class="zid" bind:value={zone.id} oninput={touch} />
            <button
              type="button"
              class="del"
              disabled={level.zones.length === 1}
              onclick={() => {
                level.zones.splice(i, 1);
                touch();
              }}>✕</button
            >
          </div>
          <label class="f"
            ><span>x</span><input
              type="number"
              bind:value={zone.x}
              disabled={i === 0}
              oninput={touch}
            /></label
          >
          <label class="f"
            ><span>tempC</span><input
              type="number"
              bind:value={zone.tempC}
              oninput={touch}
            /></label
          >
          <label class="f"
            ><span>shelf</span><input
              type="color"
              value={hex(zone.shelf)}
              oninput={(e) => setHex(i, "shelf", e.currentTarget.value)}
            /></label
          >
          <label class="f"
            ><span>deep</span><input
              type="color"
              value={hex(zone.deep)}
              oninput={(e) => setHex(i, "deep", e.currentTarget.value)}
            /></label
          >
        </div>
      {/each}
      <button type="button" onclick={addZone}>+ zone</button>
    {:else if tab === "terrain"}
      <label class="row"
        ><input
          type="checkbox"
          bind:checked={level.terrain.trenches}
          oninput={touch}
        /> carve trenches</label
      >
      <h4>tile weights</h4>
      {#each TILES as t (t.name)}
        <label class="f"
          ><span>{t.name}</span><input
            type="number"
            step="0.1"
            value={level.terrain.tileWeights?.[t.name] ?? 1}
            oninput={(e) => {
              level.terrain.tileWeights = {
                ...level.terrain.tileWeights,
                [t.name]: Number(e.currentTarget.value),
              };
              touch();
            }}
          /></label
        >
      {/each}
    {:else}
      <p class="note">
        order = rng draw order — reordering re-seeds every later spawn
      </p>
      {#each level.spawns as spawn, i (i)}
        <SpawnEditor
          spawn={spawn as unknown as Record<string, unknown>}
          index={i}
          count={level.spawns.length}
          onRemove={() => {
            level.spawns.splice(i, 1);
            touch();
          }}
          onMove={(d) => moveSpawn(i, d)}
          onEdit={touch}
        />
      {/each}
      <div class="add">
        <select bind:value={newKind}>
          {#each SPAWN_KINDS as k (k)}<option value={k}>{k}</option>{/each}
        </select>
        {#if newKind !== "snow"}
          <select bind:value={newMode}>
            <option value="scatter">scatter</option>
            <option value="place">place</option>
          </select>
        {/if}
        <button type="button" onclick={addSpawn}>+ spawn</button>
      </div>
    {/if}
  </aside>
</div>

<style>
  :global(#app) {
    flex-direction: column;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
  }
  .bar .sp {
    flex: 1;
  }
  .bar label {
    color: var(--dim);
  }
  .bar input[type="number"] {
    width: 96px;
  }
  a.btn {
    color: var(--ink);
    text-decoration: none;
    background: rgba(110, 199, 220, 0.12);
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 5px 9px;
  }
  .dot {
    color: var(--accent);
  }
  .bad {
    color: var(--bad);
  }
  .msg {
    padding: 4px 12px;
    font-size: 11px;
    color: var(--dim);
    border-bottom: 1px solid var(--line);
  }
  .cols {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  aside {
    width: 360px;
    flex: none;
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    padding: 10px 12px;
    background: var(--panel);
    border-left: 1px solid var(--line);
  }
  nav {
    display: flex;
    gap: 4px;
    margin-bottom: 10px;
  }
  nav button {
    flex: 1;
    text-transform: capitalize;
  }
  .f {
    display: grid;
    grid-template-columns: 1fr 130px;
    align-items: center;
    gap: 8px;
    margin: 5px 0;
  }
  .f span {
    color: var(--dim);
  }
  .f input {
    width: 100%;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 6px 0;
    color: var(--dim);
  }
  .zone {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 6px 10px;
    margin: 6px 0;
  }
  .zhead {
    display: flex;
    gap: 6px;
    margin-bottom: 4px;
  }
  .zid {
    flex: 1;
  }
  .del {
    color: var(--bad);
  }
  h4 {
    margin: 12px 0 4px;
    color: var(--dim);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .note {
    color: var(--dim);
    margin: 0 0 8px;
  }
  .add {
    display: flex;
    gap: 6px;
    margin-top: 10px;
  }
</style>
