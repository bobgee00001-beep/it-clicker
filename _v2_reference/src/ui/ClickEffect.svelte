<script lang="ts">
  interface Props {
    amount: string;
  }

  let { amount }: Props = $props();
</script>

<span class="click-effect" aria-hidden="true">+{amount}</span>

<style>
  .click-effect {
    position: absolute;
    color: var(--green);
    font-family: monospace;
    font-size: 13px;
    font-weight: 600;
    pointer-events: none;
    white-space: nowrap;
    animation: pop-float 700ms ease-out forwards;
  }
  @keyframes pop-float {
    0% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-36px); }
  }
</style>
