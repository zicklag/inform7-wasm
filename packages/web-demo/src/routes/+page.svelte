<script lang="ts">
  import Editor from "$lib/Editor.svelte";
  import Player from "$lib/Player.svelte";
  import { compile } from "$lib/compiler.js";

  /** Default "Hello World" story */
  const DEFAULT_SOURCE = `"Hello World" by Example

The Starting Room is a room. "A simple room with plain wooden walls and a single door leading east."

The player is in the Starting Room.

The East Road is east of the Starting Room. "A dusty road stretches into the distance."

`;

  let source = $state(DEFAULT_SOURCE);
  let output = $state<Uint8Array | null>(null);
  let error = $state<string | null>(null);
  let compiling = $state(false);
  let showIndex = $state(false);

  async function handleRun() {
    compiling = true;
    error = null;
    output = null;
    showIndex = false;

    try {
      const result = await compile({ source });
      if (result.gblorb) {
        output = result.gblorb;
      } else if (result.ulx) {
        output = result.ulx;
      } else {
        error = "Compilation produced no output.";
      }
    } catch (e: any) {
      error = e.message ?? String(e);
    } finally {
      compiling = false;
    }
  }

  function onSourceChange(val: string) {
    source = val;
  }
</script>

<svelte:head>
  <title>Inform 7 — Web Demo</title>
</svelte:head>

<!-- ── Header bar ─────────────────────────────────────────────────────── -->

<header>
  <span class="logo">Inform 7</span>
  <span class="subtitle">Web Demo</span>
  <div class="spacer"></div>
  <button class="run-btn" onclick={handleRun} disabled={compiling}>
    {#if compiling}
      Compiling…
    {:else}
      ▶ Run
    {/if}
  </button>
</header>

<!-- ── Main split pane ─────────────────────────────────────────────────── -->

<main>
  <section class="pane editor-pane">
    <Editor {onSourceChange} />
  </section>

  <section class="pane output-pane">
    {#if error}
      <div class="error-panel">
        <div class="error-title">Compile Error</div>
        <pre class="error-message">{error}</pre>
      </div>
    {:else if output}
      <Player {output} />
    {:else}
      <div class="placeholder">
        <p>Write some Inform 7 code on the left, then click <strong>▶ Run</strong>.</p>
        <p class="hint">The compiled game will appear here.</p>
      </div>
    {/if}
  </section>
</main>

<style>
  /* ── Header ─────────────────────────────────────────────────────────── */

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--header-h);
    padding: 0 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    user-select: none;
  }

  .logo {
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--accent);
  }

  .subtitle {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .spacer {
    flex: 1;
  }

  .run-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 18px;
    border: none;
    border-radius: 6px;
    background: var(--accent);
    color: var(--surface-alt);
    font-family: var(--font-sans);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
  }

  .run-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .run-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── Main split ─────────────────────────────────────────────────────── */

  main {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .pane {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .editor-pane {
    border-right: 1px solid var(--border);
  }

  .output-pane {
    position: relative;
  }

  /* ── Placeholder ────────────────────────────────────────────────────── */

  .placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px;
    text-align: center;
    color: var(--text-muted);
  }

  .placeholder strong {
    color: var(--accent);
  }

  .hint {
    font-size: 0.85rem;
  }

  /* ── Error panel ─────────────────────────────────────────────────────── */

  .error-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 16px;
    overflow: auto;
  }

  .error-title {
    font-weight: 700;
    color: var(--error);
    margin-bottom: 8px;
    font-size: 0.95rem;
  }

  .error-message {
    font-family: var(--font-mono);
    font-size: 0.82rem;
    line-height: 1.5;
    white-space: pre-wrap;
    color: var(--text);
    background: var(--surface-alt);
    padding: 12px;
    border-radius: 6px;
    border: 1px solid var(--error);
  }
</style>
