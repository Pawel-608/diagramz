# SDK Implementation Plan

## Goal

Build `packages/sdk` — a TypeScript library that lets AI agents and developers create diagrams as code, rendered via Rust WASM.

## API

```typescript
import { diagram, diagramFromJson } from 'diagramz'
import { rectangle, ellipse, diamond, text } from 'diagramz/shapes/basic'
import { RoughEngine, CleanEngine } from 'diagramz/engines'
import { Sugiyama } from 'diagramz/layout'

const d = diagram("My System", {
  layout: new Sugiyama({ direction: "LR" })
})

const backend = d.group("Backend", { color: "#e3f2fd" })
const api = backend.add(rectangle("API Server", { color: "blue" }))
const db = backend.add(rectangle("PostgreSQL"))

const frontend = d.group("Frontend")
const web = frontend.add(rectangle("Web App"))

web.to(api, "REST")
api.to(db, "queries")
frontend.to(backend, "depends on")

const url = await d.publish(new RoughEngine({ roughness: 1.5 }))
const json = d.toJson()
const code = d.toCode()
const png = d.render(new CleanEngine())

const d2 = diagramFromJson(json)
```

## Architecture

- **Diagram** = pure data (shapes, groups, connections, layout)
- **Engine** = passed at render time, decides rendering style (rough/clean) and output format
- **Shape** = unified data + geometry (carries id/label/position AND outline/clipPoint)
- **Group** = container for shapes and subgroups, implements Node interface
- **Node** = interface shared by Shape and Group, has `to()` for creating connections
- **Connection** = links any two Nodes (shape-shape, group-group, shape-group)
- **Layout** = assigns x/y positions, applied before rendering
- **WasmCanvas** = Rust/tiny-skia primitive drawing API, zero-copy Float64Array paths

## File Structure

```
packages/sdk/
  package.json
  tsconfig.json
  src/
    index.ts                  diagram(), diagramFromJson()
    core/
      node.ts                 Node interface
      shape.ts                abstract Shape class
      group.ts                Group class
      connection.ts           Connection class
      diagram.ts              Diagram class, diagram() factory, diagramFromJson()
    shapes/
      basic.ts                rectangle(), ellipse(), diamond(), text()
    engines/
      engine.ts               abstract Engine class
      clean.ts                CleanEngine
      rough.ts                RoughEngine (wobble + hachure in TS)
    layout/
      layout.ts               Layout interface
      sugiyama.ts             Sugiyama layout algorithm
    render/
      loop.ts                 render loop orchestrator
      connections.ts          connection routing (clip, arrowhead, label position)
    wasm/                     wasm-pack output (copied from renderer build)

packages/renderer/            existing Rust crate (add canvas_api.rs)
```

## Phases

### Phase 1: Rust WASM Canvas API

Add `src/canvas_api.rs` to `packages/renderer/`. New `#[wasm_bindgen]` struct `Canvas`:

- `new(w, h)`, `clear(color: u32)`
- `fill_path(segs: Float64Array, color: u32)` — parse path commands, fill with tiny-skia
- `stroke_path(segs: Float64Array, color: u32, width: f32)`
- `stroke_path_dashed(segs, color, width, dash)`
- `draw_text(text, x, y, size, color, font)` — reuse existing text.rs (font 0 = sketchy, font 1 = clean)
- `measure_text(text, size, font)` — reuse existing text.rs
- `to_png()` — encode pixmap to PNG bytes
- `to_image_data()` — raw RGBA for browser canvas

Path format: Float64Array with commands `[0,x,y]`=MoveTo, `[1,x,y]`=LineTo, `[2,x1,y1,x2,y2,x,y]`=CubicTo, `[3]`=Close.

Color format: u32 = 0xRRGGBBAA.

Does NOT touch existing Whiteboard/render code. New exports only.

### Phase 2: TS Core Data Model

- `Node` interface: id, label, `to(target, label?, opts?): Connection`
- `Shape` abstract class implements Node: data fields + abstract geometry methods
- `Group` implements Node: children array, `add()`, `group()`, recursive nesting
- `Connection`: from/to (Node refs), label, type, style
- `Diagram`: children, connections, layout, `add()`, `group()`, `toJson()`, `toCode()`, `render(engine)`, `publish(engine)`
- `diagram()` factory with defaults (Sugiyama layout)
- `diagramFromJson(json)` reconstructor

All classes have `toJSON()` for `JSON.stringify()` support. Internal state IS plain objects — no complex serialization.

### Phase 3: Basic Shapes

Four shapes in `shapes/basic.ts`:

- `rectangle(label, opts?)` — rectangular outline path
- `ellipse(label, opts?)` — ellipse approximated with 4 cubic beziers
- `diamond(label, opts?)` — rotated square path
- `text(label, opts?)` — no outline, just label

Each returns a Shape subclass with:
- `outline(w, h): Float64Array` — path commands in local coordinates
- `clipPoint(w, h, angle): [x, y]` — where a connection line intersects the border
- `labelPos(w, h): [x, y]` — center point for label text
- `defaultSize: [w, h]` — fallback size if not specified

### Phase 4: Engines

**`CleanEngine`**:
- font = 1 (Nunito Bold)
- `renderElement(el, canvas)`: solid fill_path + crisp stroke_path + draw_text
- `renderConnection(conn, canvas)`: straight line + arrowhead

**`RoughEngine`**:
- font = 0 (Architects Daughter)
- roughness: number (default 1.5), seed: number (default 0)
- `renderElement(el, canvas)`: wobble the outline path, hachure fill, then pass to canvas
- `renderConnection(conn, canvas)`: wobble the connection line
- Wobble + hachure generation is pure TS (cheap math), only pixel pushing crosses to WASM

Both have `render(diagram): Uint8Array` that runs the full render loop and returns PNG bytes.

### Phase 5: Sugiyama Layout

Port from existing `packages/renderer/src/layout.rs`:

- Longest-path ranking
- Barycenter ordering with crossing minimization
- Coordinate assignment
- TB/LR/BT/RL direction support
- Group-aware: layout within groups, then groups relative to each other

### Phase 6: Render Loop

`render/loop.ts` — called by Engine.render():

1. `layout.apply(diagram)` — assign x/y if missing
2. Compute viewport (bounding box + padding)
3. `canvas = new WasmCanvas(w, h)`
4. For each group: render group background/border
5. For each element: `engine.renderElement(el, canvas)`
6. For each connection: clip endpoints via `shape.clipPoint()`, `engine.renderConnection(conn, canvas)`
7. Draw labels via `canvas.draw_text()`
8. Return `canvas.to_png()`

`render/connections.ts`:
- `clipToShape(shape, center, target)` — find border intersection
- `arrowhead(tip, angle)` — compute arrow wing points
- `labelPosition(from, to)` — midpoint offset for connection labels

### Phase 7: Serialization

- `d.toJson()` — calls `JSON.stringify(d)`, relies on `toJSON()` methods
- `d.toCode()` — generates readable TS: each element = one `const` line, each connection = one `.to()` call, variable names derived from labels
- `diagramFromJson(json)` — parses JSON, reconstructs correct Shape subclasses based on `type` field, rebuilds Group hierarchy, restores connections

## Build Order

```
Phase 1 (Rust)  → Canvas API in WASM           (no TS deps)
Phase 2 (TS)    → Core data model              (no deps)
Phase 3 (TS)    → Shapes                       (needs Phase 2)
Phase 5 (TS)    → Layout                       (needs Phase 2)
Phase 6 (TS)    → Render loop + connections     (needs Phase 2, 3, 5)
Phase 4 (TS)    → Engines                       (needs Phase 1, 3, 6)
Phase 7 (TS)    → Serialization                 (needs Phase 2, 3)
```

## What's NOT in scope

- Architecture shape pack (database, lambda, queue, server)
- Text output engines (PumlEngine, MermaidEngine, AsciiEngine)
- SVG output
- Interactive web canvas
- Web app / API server
- Grid layout
