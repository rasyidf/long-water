<script lang="ts">
  import Coral from "./designers/Coral.svelte";
  import Fauna from "./designers/Fauna.svelte";
  import Ocean from "./designers/Ocean.svelte";
  import Squid from "./designers/Squid.svelte";
  import Terrain from "./designers/Terrain.svelte";
  import Whale from "./designers/Whale.svelte";

  const TABS = [
    { id: "terrain", label: "Terrain / WFC", cmp: Terrain },
    { id: "ocean", label: "Ocean / sky", cmp: Ocean },
    { id: "whale", label: "Whale", cmp: Whale },
    { id: "coral", label: "Coral / reef", cmp: Coral },
    { id: "squid", label: "Squid", cmp: Squid },
    { id: "fauna", label: "Fish & fauna", cmp: Fauna },
  ] as const;

  function fromHash(): string {
    const h = location.hash.replace(/^#/, "");
    return TABS.some((t) => t.id === h) ? h : TABS[0].id;
  }

  let active = $state(fromHash());
  $effect(() => {
    const on = () => (active = fromHash());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  });

  function pick(id: string) {
    location.hash = id;
    active = id;
  }

  const Current = $derived(TABS.find((t) => t.id === active)!.cmp);
</script>

<nav>
  <h1>ProcGen Viewer</h1>
  {#each TABS as tab (tab.id)}
    <button
      type="button"
      class:on={active === tab.id}
      onclick={() => pick(tab.id)}>{tab.label}</button
    >
  {/each}
  <p class="hint">drag to pan · scroll to zoom</p>
</nav>

{#key active}
  <Current />
{/key}

<style>
  nav {
    width: 168px;
    flex: none;
    height: 100%;
    box-sizing: border-box;
    padding: 12px;
    background: var(--panel);
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  h1 {
    margin: 0 0 8px;
    font-size: 13px;
    letter-spacing: 0.04em;
  }
  nav button {
    text-align: left;
  }
  .hint {
    margin-top: auto;
    color: var(--dim);
    font-size: 11px;
  }
</style>
