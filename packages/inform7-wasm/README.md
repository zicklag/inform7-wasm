# inform7-wasm

Compile [Inform 7](https://ganelson.github.io/inform-website/) interactive fiction stories to playable `.gblorb` files using pure WASM modules — no native dependencies at runtime.

Works in **Node.js**, **Deno**, and the **browser**.

## Install

```bash
npm install inform7-wasm
# or
pnpm add inform7-wasm
# or
deno add npm:inform7-wasm
```

## Usage

### Compile from source (returns buffers)

```typescript
import { compile } from "inform7-wasm";

const result = await compile({
  source: `"Hello World" by Example

The Starting Room is a room. "A simple room."
The player is in the Starting Room.

The hello sign is a thing in the Starting Room.`,
});

// result.output.gblorb — Uint8Array of the playable file
// result.output.ulx    — Uint8Array of the Glulx story
// result.output.inf   — Uint8Array of the generated Inform 6 code
```

### Compile from a project directory (Node.js/Deno)

```typescript
import { compile } from "inform7-wasm";

const result = await compile({
  projectDir: "/path/to/My Project",
});

// result.blorbFile — path to the output .gblorb
// result.ulxFile  — path to the output .ulx
```

## API

### `compile(options: CompileOptions): Promise<CompileResult>`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `source` | `string` | — | Source text of the story (mutually exclusive with `projectDir`) |
| `projectDir` | `string` | — | Path to project directory (mutually exclusive with `source`) |
| `format` | `'ulx' \| 'gblorb'` | `'gblorb'` | Output format |
| `wasm` | `{ inform7?, inform6?, inblorb? }` | bundled | Override WASM binary paths |
| `internalDir` | `string` | bundled | Override Internal resource directory |
| `extensionsDir` | `string` | — | Extensions directory (file-based mode) |
| `onProgress` | `(msg: string) => void` | — | Progress callback |

## How it works

The package bundles three WASM binaries compiled from the official Inform 7 source:

1. **inform7.wasm** — Compiles `.ni` source → Inform 6 intermediate (`.i6`)
2. **inform6.wasm** — Compiles `.i6` → Glulx story file (`.ulx`)
3. **inblorb.wasm** — Packages `.ulx` → blorb file (`.gblorb`) with resources

Plus the `Internal/` resource directory (CSS, templates, language definitions, kits).

## License

MIT
