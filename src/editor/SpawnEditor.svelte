<script lang="ts">
  import { TILES } from "../config/tiles";
  import { SPAWN_FIELDS, type FieldSpec } from "./fieldSpecs";

  let {
    spawn,
    index,
    count,
    onRemove,
    onMove,
    onEdit,
  }: {
    spawn: Record<string, unknown>;
    index: number;
    count: number;
    onRemove: () => void;
    onMove: (dir: -1 | 1) => void;
    onEdit: () => void;
  } = $props();

  const key = $derived(
    spawn.kind === "snow" ? "snow" : `${spawn.kind}:${spawn.mode}`,
  );
  const fields = $derived<FieldSpec[]>(SPAWN_FIELDS[key] ?? []);
  let open = $state(true);

  // fields the specs don't cover — shown as raw JSON so nothing is lost
  const KNOWN = $derived(
    new Set(["kind", "mode", ...fields.map((f) => f.key)]),
  );
  const extraKeys = $derived(Object.keys(spawn).filter((k) => !KNOWN.has(k)));

  function num(k: string): number {
    return (spawn[k] as number) ?? 0;
  }
  function setNum(k: string, v: string) {
    spawn[k] = Number(v);
    onEdit();
  }
  function rng(k: string): [number, number] {
    return (spawn[k] as [number, number]) ?? [0, 0];
  }
  function setRng(k: string, i: 0 | 1, v: string) {
    const r = [...rng(k)] as [number, number];
    r[i] = Number(v);
    spawn[k] = r;
    onEdit();
  }
  function tiles(k: string): string {
    return ((spawn[k] as string[]) ?? []).join(", ");
  }
  function setTiles(k: string, v: string) {
    spawn[k] = v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onEdit();
  }

  let extraJson = $state("");
  let extraErr = $state("");
  $effect(() => {
    // reset the JSON box whenever the directive identity changes
    void key;
    extraJson = JSON.stringify(
      Object.fromEntries(extraKeys.map((k) => [k, spawn[k]])),
      null,
      2,
    );
    extraErr = "";
  });
  function applyExtra() {
    try {
      const obj = JSON.parse(extraJson) as Record<string, unknown>;
      for (const k of extraKeys) if (!(k in obj)) delete spawn[k];
      Object.assign(spawn, obj);
      extraErr = "";
      onEdit();
    } catch (e) {
      extraErr = (e as Error).message;
    }
  }
</script>

<div class="spawn">
  <header>
    <button type="button" class="tw" onclick={() => (open = !open)}>
      {open ? "▾" : "▸"} <b>{index + 1}. {spawn.kind}</b>
      {spawn.mode ?? ""}
    </button>
    <span class="sp"></span>
    <button type="button" disabled={index === 0} onclick={() => onMove(-1)}
      >↑</button
    >
    <button
      type="button"
      disabled={index === count - 1}
      onclick={() => onMove(1)}>↓</button
    >
    <button type="button" class="del" onclick={onRemove}>✕</button>
  </header>

  {#if open}
    <div class="body">
      {#each fields as f (f.key)}
        {#if f.kind === "num"}
          <label class="row">
            <span>{f.key}</span>
            <input
              type="number"
              value={num(f.key)}
              oninput={(e) => setNum(f.key, e.currentTarget.value)}
            />
          </label>
        {:else if f.kind === "range"}
          <div class="row">
            <span>{f.key}</span>
            <input
              type="number"
              value={rng(f.key)[0]}
              oninput={(e) => setRng(f.key, 0, e.currentTarget.value)}
            />
            <input
              type="number"
              value={rng(f.key)[1]}
              oninput={(e) => setRng(f.key, 1, e.currentTarget.value)}
            />
          </div>
        {:else}
          <label class="row">
            <span>{f.key}</span>
            <input
              type="text"
              value={tiles(f.key)}
              placeholder={TILES.map((t) => t.name).join(" ")}
              oninput={(e) => setTiles(f.key, e.currentTarget.value)}
            />
          </label>
        {/if}
      {/each}

      {#if extraKeys.length}
        <p class="note">other fields ({extraKeys.join(", ")}) — JSON:</p>
        <textarea
          bind:value={extraJson}
          rows={Math.min(14, extraKeys.length * 3 + 3)}></textarea>
        <button type="button" onclick={applyExtra}>apply JSON</button>
        {#if extraErr}<p class="err">{extraErr}</p>{/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .spawn {
    border: 1px solid var(--line);
    border-radius: 8px;
    margin: 6px 0;
    background: rgba(4, 10, 18, 0.4);
  }
  header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
  }
  .tw {
    background: none;
    border: none;
    padding: 2px 4px;
    text-align: left;
  }
  .tw b {
    color: var(--ink);
  }
  .sp {
    flex: 1;
  }
  .del {
    color: var(--bad);
  }
  .body {
    padding: 6px 10px 10px;
  }
  .row {
    display: grid;
    grid-template-columns: 90px 1fr 1fr;
    align-items: center;
    gap: 6px;
    margin: 4px 0;
  }
  .row:has(input[type="text"]),
  .row:has(input[type="number"]:only-of-type) {
    grid-template-columns: 90px 1fr;
  }
  .row span {
    color: var(--dim);
  }
  .row input {
    width: 100%;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    background: rgba(2, 6, 12, 0.6);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 6px;
    font:
      11px/1.4 ui-monospace,
      monospace;
  }
  .note {
    color: var(--dim);
    margin: 8px 0 4px;
  }
  .err {
    color: var(--bad);
  }
</style>
