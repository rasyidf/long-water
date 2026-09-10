<script lang="ts">
  let { value = $bindable() }: { value: number } = $props();

  function roll() {
    value = 1 + Math.floor(Math.random() * 9_999_999);
  }
</script>

<label class="seed">
  <span>seed</span>
  <input type="number" min="1" bind:value />
  <button type="button" onclick={roll} title="random seed">⟳</button>
</label>

<style>
  .seed {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 7px 0;
  }
  .seed span {
    color: var(--dim);
  }
  input {
    width: 96px;
  }
</style>
