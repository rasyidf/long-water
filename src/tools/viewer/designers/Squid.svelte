<script lang="ts">
  import { buildSquidLevel } from "../../../world/designerScene";
  import SceneDesigner from "../../lib/SceneDesigner.svelte";
  import Slider from "../../lib/Slider.svelte";

  let seed = $state(3);
  let step = $state(2200);
  let sizeLo = $state(0.8);
  let sizeHi = $state(1.3);
  let yLo = $state(2200);
  let yHi = $state(3200);

  const level = $derived(
    buildSquidLevel({
      step,
      size: [sizeLo, Math.max(sizeLo, sizeHi)],
      yBand: [yLo, Math.max(yLo, yHi)],
    }),
  );
</script>

<SceneDesigner
  title="Squid"
  {level}
  bind:seed
  loadOpts={{ focus: { x: 2400, y: 2500, scale: 0.34 } }}
>
  {#snippet controls()}
    <Slider label="spacing" bind:value={step} min={600} max={5000} step={100} />
    <Slider
      label="size min"
      bind:value={sizeLo}
      min={0.4}
      max={2}
      step={0.05}
      fmt={(v) => v.toFixed(2)}
    />
    <Slider
      label="size max"
      bind:value={sizeHi}
      min={0.4}
      max={2}
      step={0.05}
      fmt={(v) => v.toFixed(2)}
    />
    <Slider
      label="depth band top"
      bind:value={yLo}
      min={900}
      max={4600}
      step={50}
    />
    <Slider
      label="depth band bottom"
      bind:value={yHi}
      min={900}
      max={4600}
      step={50}
    />
  {/snippet}
</SceneDesigner>
