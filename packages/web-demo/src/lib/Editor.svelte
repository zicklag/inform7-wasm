<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    onSourceChange: (value: string) => void;
  }

  let { onSourceChange }: Props = $props();

  let containerEl: HTMLDivElement;
  let editor: any = $state(null);

  onMount(async () => {
    const monaco = await import("monaco-editor");

    // Configure Monaco to load workers from CDN (avoids bundling them)
    monaco.editor.defineTheme("inform-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6c7086", fontStyle: "italic" },
        { token: "keyword", foreground: "cba6f7" },
        { token: "string", foreground: "a6e3a1" },
        { token: "number", foreground: "fab387" },
        { token: "type", foreground: "89b4fa" },
      ],
      colors: {
        "editor.background": "#11111b",
        "editor.foreground": "#cdd6f4",
        "editor.lineHighlightBackground": "#1e1e2e",
        "editor.selectionBackground": "#45475a",
        "editorCursor.foreground": "#f5e0dc",
        "editorLineNumber.foreground": "#6c7086",
        "editorLineNumber.activeForeground": "#cdd6f4",
      },
    });

    editor = monaco.editor.create(containerEl, {
      value: `"Hello World" by Example

The Starting Room is a room. "A simple room with plain wooden walls and a single door leading east."

The player is in the Starting Room.

The East Road is east of the Starting Room. "A dusty road stretches into the distance."
`,
      language: "plaintext",
      theme: "inform-dark",
      fontSize: 14,
      fontFamily:
        "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      lineNumbers: "on",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      wordWrap: "on",
      tabSize: 2,
      renderWhitespace: "selection",
      padding: { top: 12 },
    });

    // Notify parent of changes
    editor.onDidChangeModelContent(() => {
      onSourceChange(editor.getValue());
    });

    return () => {
      editor?.dispose();
    };
  });
</script>

<div bind:this={containerEl} class="editor-container"></div>

<style>
  .editor-container {
    flex: 1;
    overflow: hidden;
  }
</style>
