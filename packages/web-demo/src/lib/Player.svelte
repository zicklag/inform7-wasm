<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    output: Uint8Array;
  }

  let { output }: Props = $props();

  let gameportEl = $state<HTMLDivElement>();
  let scriptsLoaded = $state(false);
  let loadError = $state<string | null>(null);

  // ── Load Quixe/GlkOte scripts on mount ────────────────────────────────

  onMount(async () => {
    try {
      await loadScripts();
      scriptsLoaded = true;
    } catch (e: any) {
      loadError = e.message ?? String(e);
    }
  });

  // ── When output changes, start the game ───────────────────────────────

  $effect(() => {
    if (!scriptsLoaded || !output) return;
    startGame(output);
  });

  // ── Helpers ───────────────────────────────────────────────────────────

  function arrayBufferToBase64(buf: Uint8Array): string {
    let binary = "";
    const len = buf.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(buf[i]);
    }
    return btoa(binary);
  }

  function startGame(data: Uint8Array) {
    // Clear the gameport before loading a new game
    if (gameportEl) {
      gameportEl.innerHTML = `
        <div id="windowport"></div>
        <div id="loadingpane">
          <img src="interpreter/waiting.gif" alt="LOADING"><br>
          <em>&nbsp;&nbsp;&nbsp;Loading...</em>
        </div>
        <div id="errorpane" style="display:none;"><div id="errorcontent">...</div></div>
      `;
    }

    const base64 = arrayBufferToBase64(data);

    // Set game options (matching Quixe template defaults)
    (window as any).game_options = {
      image_info_map: "StaticImageInfo",
      use_query_story: false,
      log_execution_time: true,
      set_page_title: false,
      inspacing: 0,
      outspacing: 0,
    };

    try {
      (window as any).GiLoad.load_run(null, base64, "base64");
    } catch (e: any) {
      loadError = e.message ?? String(e);
    }
  }

  async function loadScripts(): Promise<void> {
    // Load GlkOte stylesheets first
    const stylesheets = [
      "interpreter/glkote.css",
      "interpreter/dialog.css",
    ];
    for (const href of stylesheets) {
      loadStylesheet(href);
    }

    // Inject dark-theme overrides for GlkOte
    injectGlkOteDarkTheme();

    const scripts = [
      "interpreter/jquery-1.12.4.min.js",
      "interpreter/glkote.min.js",
      "interpreter/quixe.min.js",
    ];

    for (const src of scripts) {
      await loadScript(src);
    }
  }

  function injectGlkOteDarkTheme() {
    const id = "glkote-dark-theme";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      #gameport .WindowFrame {
        background: #1e1e2e;
      }
      #gameport .BufferWindow {
        background: #1e1e2e;
        color: #cdd6f4;
        font-family: Georgia, "Times New Roman", Times, serif;
        font-size: 15px;
        line-height: 1.5;
        padding: 6px 12px;
      }
      #gameport .GridWindow {
        background: #181825;
        color: #a6adc8;
        font-family: var(--font-mono), monaco, andale mono, courier, monospace;
        font-size: 13px;
        padding: 4px 10px;
      }
      #gameport .GraphicsWindow canvas {
        background: #11111b;
      }
      #gameport .Style_normal {
        color: #cdd6f4;
      }
      #gameport .Style_input {
        color: #f5e0dc;
        font-weight: bold;
      }
      #gameport .Style_emphasized {
        color: #f5c2e7;
      }
      #gameport .Style_header {
        color: #89b4fa;
      }
      #gameport .Style_subheader {
        color: #89b4fa;
      }
      #gameport .Style_alert {
        color: #f38ba8;
      }
      #gameport .Style_note {
        color: #a6adc8;
      }
      #gameport .Style_blockquote {
        background: #181825;
        color: #bac2de;
      }
      #gameport .Style_preformatted {
        color: #a6e3a1;
      }
      #gameport .BufferWindow .Input {
        font-family: Georgia, "Times New Roman", Times, serif;
        font-size: 15px;
        background: transparent;
        color: #f5e0dc;
      }
      #gameport .GridWindow .Input {
        font-family: var(--font-mono), monaco, andale mono, courier, monospace;
        font-size: 13px;
        background: transparent;
        color: #f5e0dc;
      }
      #gameport .Input {
        border: none;
        outline: none;
        background: transparent;
        color: #f5e0dc;
        font-weight: bold;
        margin-left: 5px;
      }
      #gameport .BufferLine {
        color: #cdd6f4;
      }
      #gameport .MorePrompt {
        background: #45475a;
        color: #cdd6f4;
        opacity: 0.8;
      }
      #gameport a {
        color: #89b4fa;
      }
      #gameport a:visited {
        color: #b4befe;
      }
      #errorpane {
        background: #1e1e2e;
        border-bottom: 2px solid #f38ba8;
      }
      #errorcontent {
        color: #f38ba8;
      }
    `;
    document.head.appendChild(style);
  }

  function loadStylesheet(href: string) {
    const existing = document.querySelector(`link[href$="${href}"]`);
    if (existing) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(
        `script[src$="${src}"]`,
      );
      if (existing) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }
</script>

{#if loadError}
  <div class="player-error">
    <div class="error-title">Player Error</div>
    <pre class="error-message">{loadError}</pre>
  </div>
{:else if !scriptsLoaded}
  <div class="player-loading">
    <div class="spinner"></div>
    <span>Loading player…</span>
  </div>
{:else}
  <div
    bind:this={gameportEl}
    id="gameport"
    class="gameport"
  >
    <!-- Populated by startGame() with windowport, loadingpane, errorpane -->
  </div>
{/if}

<style>
  .gameport {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .player-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .player-error {
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
