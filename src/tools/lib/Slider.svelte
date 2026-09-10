<script lang="ts">
  let {
    label,
    value = $bindable(),
    min,
    max,
    step = 1,
    fmt = (v: number) => String(v),
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    fmt?: (v: number) => string;
  } = $props();
</script>

<label class="ctl">
  <span class="name">{label}</span>
  <output>{fmt(value)}</output>
  <input type="range" {min} {max} {step} bind:value />
</label>

<style>
  .ctl {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 2px 8px;
    margin: 7px 0;
  }
  .ctl {
    cursor: pointer;
  }
  .name {
    color: var(--dim);
  }
  output {
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  input {
    grid-column: 1 / -1;
    width: 100%;
    margin: 0;
  }
</style>
