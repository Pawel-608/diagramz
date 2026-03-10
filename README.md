# diagramz

Pastebin for diagrams — designed to be written by AI coding agents like [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Codex](https://openai.com/index/codex/), and other LLM-powered tools. Agents create diagrams via code or REST API, humans get instant shareable links to view and edit in a canvas UI.

**[diagramz.xyz](https://diagramz.xyz)** | [LLM reference](https://diagramz.xyz/llms.txt)

## How it works

1. An AI agent writes a diagram in JavaScript (or calls the REST API directly)
2. Render locally (PNG/SVG) or publish to diagramz.xyz for a shareable link
3. Edit interactively in the browser canvas

```js
import { diagram } from 'diagramz'
import { rectangle, ellipse } from 'diagramz/shapes/basic'

const d = diagram('My System')

const web = d.add(rectangle('Web App'))
const api = d.add(rectangle('API Server'))
const db  = d.add(ellipse('Database'))

web.to(api, 'REST')
api.to(db, 'SQL')

export default d
```

```sh
npx diagramz render diagram.js -o diagram.png
npx diagramz publish diagram.js
```

Re-running `publish` updates the same diagram in-place (the CLI saves the id to your source file automatically).

## Packages

| Package | Path | Description | License |
|---------|------|-------------|---------|
| **[diagramz](https://www.npmjs.com/package/diagramz)** | `packages/sdk` | JS/TS SDK — shapes, layout, rendering, CLI | MIT |
| **diagramz-renderer** | `packages/renderer` | Rust crate — pixel rendering (tiny-skia), WASM canvas | MIT |

## Architecture

```
packages/
  sdk/          JS/TS SDK: diagram DSL, Sugiyama layout, CLI
  renderer/     Rust: tiny-skia pixel rendering, hand-drawn effect, WASM target
apps/
  api/          Axum REST API + SQLite (proprietary)
  web/          React SPA with WASM canvas (proprietary)
```

- **Custom renderer** — tiny-skia for pixels, fontdue for text, hand-drawn "rough" effect
- **Identical rendering** on frontend (WASM) and backend (native Rust) via shared tiny-skia code
- **No AI generation on our side** — Claude Code (or any agent) calls the REST API directly
- Diagrams are ephemeral (30-day TTL), no signup required

## REST API

Base URL: `https://diagramz.xyz`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/diagrams` | Create diagram |
| `GET` | `/api/v1/diagrams/:id` | Get diagram |
| `PATCH` | `/api/v1/diagrams/:id` | Update diagram |
| `DELETE` | `/api/v1/diagrams/:id` | Delete diagram |
| `GET` | `/api/v1/diagrams/:id/svg` | Export SVG |
| `GET` | `/api/v1/diagrams/:id/png` | Export PNG |

## Development

```sh
# Rust renderer (native)
cargo build -p diagramz-renderer

# WASM build (for web frontend)
wasm-pack build packages/renderer --target web --out-dir ../../apps/web/src/wasm --features wasm

# JS SDK
cd packages/sdk && npm run build

# Web frontend
pnpm install && pnpm dev:web
```

## License

- `packages/` — MIT
- `apps/` — Proprietary
