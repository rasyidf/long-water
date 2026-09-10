<script lang="ts">
  import { SPECIES } from "../../../config/species";
  import { buildFaunaLevel } from "../../../world/designerScene";
  import SceneDesigner from "../../lib/SceneDesigner.svelte";
  import Slider from "../../lib/Slider.svelte";

  let seed = $state(3);
  let count = $state(30);
  let spreadX = $state(260);
  let spreadY = $state(160);
  let velX = $state(40);
  let velY = $state(18);

  const level = $derived(
    buildFaunaLevel({
      count,
      spread: [spreadX, spreadY],
      vel: [velX, velY],
    }),
  );
</script>

<SceneDesigner
  title="Fish & fauna"
  {level}
  bind:seed
  loadOpts={{ focus: { x: 2400, y: 620, scale: 0.5 } }}
>
  {#snippet controls()}
    <p class="note">
      one school per species ({SPECIES.length}), left → right in
      <code>config/species.ts</code> order
    </p>
    <Slider label="fish per school" bind:value={count} min={4} max={60} />
    <Slider
      label="spread x"
      bind:value={spreadX}
      min={40}
      max={600}
      step={10}
    />
    <Slider
      label="spread y"
      bind:value={spreadY}
      min={40}
      max={600}
      step={10}
    />
    <Slider label="swim speed x" bind:value={velX} min={0} max={120} />
    <Slider label="swim speed y" bind:value={velY} min={0} max={120} />
  {/snippet}
</SceneDesigner>

<style>
  .note {
    color: var(--dim);
    margin: 0 0 8px;
  }
  code {
    color: var(--accent);
  }
</style>
