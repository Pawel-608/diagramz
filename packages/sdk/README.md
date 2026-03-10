# diagramz

Diagrams as code — designed to be written by AI coding agents like [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Codex](https://openai.com/index/codex/), and other LLM-powered tools. Build, render, and share diagrams from JavaScript.

**[diagramz.xyz](https://diagramz.xyz)** | [LLM reference](https://diagramz.xyz/llms.txt)

```
npm install diagramz
```

## Quick start

```js
import { diagram } from 'diagramz'
import { rectangle, ellipse, diamond } from 'diagramz/shapes/basic'

const d = diagram('My System')

const web = d.add(rectangle('Web App'))
const api = d.add(rectangle('API Server'))
const db  = d.add(ellipse('Database'))

web.to(api, 'REST')
api.to(db, 'SQL')

export default d
```

Render locally or publish to [diagramz.xyz](https://diagramz.xyz):

```sh
npx diagramz render diagram.js -o diagram.png
npx diagramz render diagram.js -o diagram.svg
npx diagramz publish diagram.js
```

## CLI

```
Usage: diagramz <command> <input.js> [options]

Commands:
  render <input.js>    Render diagram to PNG or SVG
  publish <input.js>   Publish to diagramz.xyz and get a shareable link

Render options:
  -o, --output <file>    Output file (default: diagram.png)
  -f, --format <fmt>     png | svg (default: guessed from output, or png)
  -e, --engine <name>    rough | clean (default: rough)
  -s, --scale <number>   Scale factor for PNG (default: 2)

Publish options:
  --api-url <url>        API base URL (default: https://diagramz.xyz)
```

### Re-publishing

When you `publish`, the CLI writes a `// @diagramz-id <uuid>` comment into your source file. On subsequent publishes, it PATCHes the same diagram instead of creating a new one — so you keep a stable URL.

```sh
npx diagramz publish diagram.js   # creates, adds // @diagramz-id abc123
# edit diagram.js...
npx diagramz publish diagram.js   # updates abc123 in-place
```

You can also set the id programmatically:

```js
const d = diagram('My System', { id: 'existing-uuid-here' })
```

## Shapes

### Basic shapes

```js
import { rectangle, ellipse, diamond, text } from 'diagramz/shapes/basic'

d.add(rectangle('Box'))
d.add(ellipse('Circle'))
d.add(diamond('Decision'))
d.add(text('Label'))
```

Shape options:

```js
d.add(rectangle('Styled', {
  color: '#ffffff',       // text/stroke color
  fillColor: '#4A90D9',  // background fill
  strokeWidth: 2,
  fontSize: 16,
  width: 160,
  height: 80,
}))
```

### UML class diagrams

```js
import { ClassShape } from 'diagramz/shapes/uml'

d.add(new ClassShape('User', {
  stereotype: 'entity',
  fields: ['+name: string', '-email: string'],
  methods: ['+getName(): string'],
}))
```

### C4 model

```js
import { c4Person, c4System, c4Container, c4Component, c4Database } from 'diagramz/shapes/c4'

d.add(c4Person('User', { description: 'End user' }))
d.add(c4System('Backend', { description: 'Core API', technology: 'Rust' }))
d.add(c4Database('PostgreSQL', { external: true }))
```

## Groups

Nest shapes inside labeled containers:

```js
const backend = d.group('Backend Services')
const api = backend.add(rectangle('API'))
const worker = backend.add(rectangle('Worker'))

api.to(worker, 'enqueue')
```

Group options: `color`, `fillColor`, `strokeWidth`.

## Connections

```js
// Basic
source.to(target)
source.to(target, 'label')

// With options
source.to(target, 'label', { type: 'arrow', color: '#ff0000', strokeDash: [6, 3] })
```

Connection types: `arrow`, `line`, `inherit`, `implement`, `compose`, `aggregate`, `depend`.

Shorthand presets:

```js
import { arrow, line, inherit, implement, compose, aggregate, depend } from 'diagramz'

source.to(target, 'extends', inherit())
source.to(target, 'uses', depend({ color: '#999' }))
```

## Layout

Auto-layout uses the Sugiyama (hierarchical) algorithm. Configure direction and spacing:

```js
import { Sugiyama } from 'diagramz/layout'

const d = diagram('My System', {
  layout: new Sugiyama({ direction: 'LR', spacing: 60, layerSpacing: 120 }),
})
```

Directions: `TB` (top-bottom, default), `BT`, `LR`, `RL`.

## Color palettes

Apply a preset palette so shapes get auto-colored:

```js
import { palettes } from 'diagramz'

const d = diagram('Colorful', { colors: palettes.blueprint })
```

Available palettes: `default`, `blueprint`, `earth`, `mono`, `pastel`, `c4`.

Or pass custom colors:

```js
const d = diagram('Custom', { colors: ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'] })
```

## Rendering engines

- **rough** (default) — hand-drawn, sketchy style
- **clean** — crisp, precise lines

```js
import { RoughEngine, CleanEngine } from 'diagramz/engines'
```

## JSON format

Diagrams serialize to/from JSON for storage and the REST API:

```js
import { diagram, diagramFromJson } from 'diagramz'

// Serialize
const json = d.toJson()

// Deserialize
const restored = diagramFromJson(json)
```

The JSON format includes an optional `id` field for linking to a published diagram:

```json
{
  "id": "abc-123",
  "title": "My System",
  "layout": { "name": "sugiyama", "direction": "TB" },
  "children": [
    { "id": "e1", "type": "rectangle", "label": "Web App" }
  ],
  "connections": [
    { "id": "c1", "from": "e1", "to": "e2", "type": "arrow", "label": "REST" }
  ]
}
```

## License

MIT
