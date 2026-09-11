<script lang="ts">
  import { untrack, type Snippet } from "svelte";

  import type { LevelDef } from "../../world/level/schema";
  import { SceneHost, type LoadOpts } from "../SceneHost";
  import Panel from "./Panel.svelte";
  import PixiStage from "./PixiStage.svelte";
  import SeedField from "./SeedField.svelte";
  import Toggle from "./Toggle.svelte";

  let {
    title,
    level,
    seed = $bindable(),
    loadOpts,
    light = false,
    controls,
    overlay,
    onready,
  }: {
    title: string;
    level: LevelDef;
    seed: number;
    loadOpts?: LoadOpts;
    /** starting state of the scene-light toggle. Designers that are *about*
     * the lighting (the ocean playground) want it on; procgen shape designers
     * want it off so the falloff doesn't hide what they are tuning. */
    light?: boolean;
    controls: Snippet;
    overlay?: Snippet;
    onready?: (host: SceneHost) => void;
  } = $props();

  let host = $state<SceneHost | undefined>();
  // the toggle owns its state from here on; `light` is only the starting value
  let lit = $state(untrack(() => light));
  let timer = 0;

  function mount(el: HTMLDivElement) {
    const h = new SceneHost(el);
    h.init().then(() => {
      host = h;
      onready?.(h);
    });
    return () => h.dispose();
  }

  // reload (debounced) whenever the generated level or seed changes
  $effect(() => {
    const lv = level;
    const sd = seed;
    const opts = { ...loadOpts, light: lit };
    if (!host) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => host?.load(lv, sd, opts), 120);
  });
</script>

<Panel {title}>
  <SeedField bind:value={seed} />
  <Toggle label="scene light (depth falloff / god-rays)" bind:value={lit} />
  {@render controls()}
</Panel>

<PixiStage {mount} />

{#if overlay}
  {@render overlay()}
{/if}
