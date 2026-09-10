<script lang="ts">
  let { label, value = $bindable() }: { label: string; value: boolean } =
    $props();
</script>

<label class="row">
  <input type="checkbox" bind:checked={value} />
  <span>{label}</span>
</label>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 7px 0;
    color: var(--dim);
    cursor: pointer;
  }
</style>
