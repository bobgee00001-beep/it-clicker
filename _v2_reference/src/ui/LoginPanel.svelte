<script lang="ts">
  // Login-/Account-Panel (Phase 3). Reagiert auf den Auth-Store-Status.
  // Offline-first: bei status 'unavailable' rendert die Komponente nichts.
  import { auth } from '../stores/auth';

  let email = $state('');
  let code = $state('');
  let busy = $state(false);
  let lastError = $state<string | null>(null);
  let sentTo = $state<string | null>(null);

  const status = $derived($auth.status);

  async function sendLink(): Promise<void> {
    if (busy || !email.trim()) return;
    busy = true;
    lastError = null;
    const res = await auth.signInWithEmail(email);
    busy = false;
    if (res.ok) sentTo = email.trim();
    else lastError = res.error ?? 'Senden fehlgeschlagen.';
  }

  async function redeem(): Promise<void> {
    if (busy || !code.trim()) return;
    busy = true;
    lastError = null;
    const res = await auth.redeemInvite(code);
    busy = false;
    if (res.ok) code = '';
    else lastError = res.error ?? 'Einlösen fehlgeschlagen.';
  }

  async function signOut(): Promise<void> {
    busy = true;
    await auth.signOut();
    busy = false;
    sentTo = null;
    email = '';
    code = '';
    lastError = null;
  }
</script>

{#if status !== 'unavailable'}
  <div class="login-panel">
    {#if status === 'loading'}
      <p class="muted">… Sitzung wird geprüft</p>
    {:else if status === 'signed-out'}
      {#if sentTo}
        <p class="ok">Link gesendet an <strong>{sentTo}</strong>.</p>
        <p class="muted">Postfach checken und den Magic-Link klicken.</p>
        <button class="link" onclick={() => (sentTo = null)}>andere Adresse</button>
      {:else}
        <label class="muted" for="lp-email">Cloud-Save: Login per Magic-Link</label>
        <input
          id="lp-email"
          type="email"
          placeholder="du@beispiel.de"
          bind:value={email}
          disabled={busy}
          onkeydown={(e) => e.key === 'Enter' && sendLink()}
        />
        <button onclick={sendLink} disabled={busy || !email.trim()}>Magic-Link senden</button>
      {/if}
    {:else if status === 'needs-invite'}
      <p class="muted">Eingeloggt als <strong>{$auth.email}</strong></p>
      <label class="muted" for="lp-code">Invite-Code zum Freischalten:</label>
      <input
        id="lp-code"
        type="text"
        placeholder="team-…"
        bind:value={code}
        disabled={busy}
        onkeydown={(e) => e.key === 'Enter' && redeem()}
      />
      <button onclick={redeem} disabled={busy || !code.trim()}>Einlösen</button>
      <button class="link" onclick={signOut} disabled={busy}>Abmelden</button>
    {:else if status === 'player'}
      <p class="ok">● Angemeldet als <strong>{$auth.email}</strong></p>
      <p class="muted">Cloud-Save aktiv</p>
      <button class="link" onclick={signOut} disabled={busy}>Abmelden</button>
    {/if}
    {#if lastError}<p class="err">{lastError}</p>{/if}
  </div>
{/if}

<style>
  .login-panel {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    color: #cfe8d4;
    padding: 0.6rem;
    border: 1px solid #143a1d;
    background: #0a120c;
  }
  .login-panel input {
    background: #06100a;
    border: 1px solid #1c5a2b;
    color: #9af7b0;
    padding: 0.35rem 0.5rem;
    font-family: inherit;
    font-size: 0.8rem;
  }
  .login-panel input:focus {
    outline: none;
    border-color: #00ff41;
  }
  .login-panel button {
    background: transparent;
    border: 1px solid #00ff41;
    color: #00ff41;
    padding: 0.35rem 0.5rem;
    font-family: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .login-panel button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .login-panel button:hover:not(:disabled) {
    background: rgba(0, 255, 65, 0.1);
  }
  .login-panel button.link {
    border: none;
    color: #6f8f78;
    padding: 0.15rem 0;
    text-align: left;
    text-decoration: underline;
  }
  .login-panel .muted {
    color: #6f8f78;
    margin: 0;
  }
  .login-panel .ok {
    color: #00ff41;
    margin: 0;
  }
  .login-panel .err {
    color: #ff5c5c;
    margin: 0;
  }
  .login-panel strong {
    color: #cfe8d4;
  }
</style>
