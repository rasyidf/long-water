<script lang="ts">
  import { onMount } from "svelte";

  /** `mount` gets the container element and returns a cleanup fn (or a promise
   * of one). Put all Pixi setup/teardown there so this component owns none. */
  let {
    mount,
  }: {
    mount: (
      el: HTMLDivElement,
    ) => void | (() => void) | Promise<void | (() => void)>;
  } = $props();

  let el: HTMLDivElement;

  onMount(() => {
    let cleanup: void | (() => void);
    const r = mount(el);
    Promise.resolve(r).then((c) => (cleanup = c));
    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  });
</script>

<div class="stage" bind:this={el}></div>

<style>
  .stage {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }
  .stage :global(canvas) {
    display: block;
  }
</style>
