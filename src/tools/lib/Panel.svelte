<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    children,
    side = "left",
  }: { title?: string; children: Snippet; side?: "left" | "right" } = $props();
</script>

<section class="panel {side}">
  {#if title}<h2>{title}</h2>{/if}
  {@render children()}
</section>

<style>
  .panel {
    width: 280px;
    flex: none;
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    padding: 12px 14px;
    background: var(--panel);
    border-right: 1px solid var(--line);
  }
  .panel.right {
    border-right: none;
    border-left: 1px solid var(--line);
  }
  h2 {
    margin: 0 0 10px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--dim);
  }
</style>
