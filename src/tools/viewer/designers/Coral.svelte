<script lang="ts">
  import { buildCoralLevel } from "../../../world/designerScene";
  import SceneDesigner from "../../lib/SceneDesigner.svelte";
  import Slider from "../../lib/Slider.svelte";
  import Toggle from "../../lib/Toggle.svelte";

  let seed = $state(3);
  let patchCount = $state(4);
  let kinds = $state(5);
  let scaleLo = $state(0.75);
  let scaleHi = $state(1.7);
  let gap = $state(2600);
  let reef = $state(true);

  const level = $derived(
    buildCoralLevel({
      patchCount,
      kinds,
      scale: [scaleLo, Math.max(scaleLo, scaleHi)],
      gap,
      reef,
    }),
  );
</script>

<SceneDesigner
  title="Coral / reef"
  {level}
  bind:seed
  loadOpts={{ focus: { x: 2200, y: 750, scale: 0.55 } }}
>
  {#snippet controls()}
    <Slider label="patch count" bind:value={patchCount} min={1} max={10} />
    <Slider label="coral kinds" bind:value={kinds} min={1} max={5} />
    <Slider
      label="scale min"
      bind:value={scaleLo}
      min={0.3}
      max={2.5}
      step={0.05}
      fmt={(v) => v.toFixed(2)}
    />
    <Slider
      label="scale max"
      bind:value={scaleHi}
      min={0.3}
      max={2.5}
      step={0.05}
      fmt={(v) => v.toFixed(2)}
    />
    <Slider
      label="gap between patches"
      bind:value={gap}
      min={800}
      max={6000}
      step={100}
    />
    <Toggle label="reef + attached school" bind:value={reef} />
  {/snippet}
</SceneDesigner>
