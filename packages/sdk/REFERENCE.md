# Diagramz SDK — LLM Reference

## Quick Start

```js
import { diagram, palettes } from 'diagramz'
import { rectangle, ellipse, diamond, text } from 'diagramz/shapes/basic'

const d = diagram('My Diagram', {
  colors: palettes.default,
  background: '#fafafa',
  description: 'A simple diagram showing\nthree connected nodes',
})

const a = d.add(rectangle('Service A'))
const b = d.add(rectangle('Service B'))
const c = d.add(ellipse('Database'))

a.to(b, 'calls')
b.to(c, 'reads from')

export default d
```

Run: `node packages/sdk/dist/cli.js my-diagram.js` → outputs `diagram.png`

---

## Imports

| Import path | Exports |
|---|---|
| `diagramz` | `diagram`, `diagramFromJson`, `palettes`, `contrastColor` |
| `diagramz/shapes/basic` | `rectangle`, `ellipse`, `diamond`, `text` |
| `diagramz/shapes/uml` | `classShape` |
| `diagramz/shapes/c4` | `c4Person`, `c4System`, `c4ExternalSystem`, `c4Container`, `c4ExternalContainer`, `c4Component`, `c4Database` |
| `diagramz/engines` | `CleanEngine`, `RoughEngine` |
| `diagramz/layout` | `Sugiyama` |
| `diagramz/themes` | `palettes`, `contrastColor`, `applyPalette` |

---

## Core API

### `diagram(title?, opts?) → Diagram`

Creates a new diagram.

```ts
interface DiagramOpts {
  layout?: Layout                // default: Sugiyama({ direction: 'TB' })
  colors?: string[]              // palette of hex colors (shapes pick defaults from this)
  background?: string            // canvas background hex color
  description?: string           // legend text rendered centered below the diagram (supports \n)
}
```

### `Diagram`

```ts
d.add(shape)                     // → Shape (adds shape, returns it)
d.group(label, opts?)            // → Group (creates a group box)
d.render(engine, factory)        // → Uint8Array (PNG)
d.toJSON()                       // → serializable object
d.toCode()                       // → JS source code string
```

### `Group`

```ts
interface GroupOpts {
  id?: string
  color?: string        // border/label color
  fillColor?: string    // background fill
  strokeWidth?: number
}

g.add(shape)            // → Shape
g.group(label, opts?)   // → nested Group
g.to(target, label?, opts?)  // → Connection
```

---

## Shapes

All shape constructors accept `(label, opts?)`:

```ts
interface ShapeOpts {
  id?: string
  color?: string        // text/stroke color
  fillColor?: string    // fill color
  strokeWidth?: number
  fontSize?: number
  width?: number
  height?: number
  x?: number
  y?: number
}
```

### Basic Shapes

```js
rectangle(label, opts?)   // 120×60 default
ellipse(label, opts?)     // 120×80 default
diamond(label, opts?)     // 120×80 default
text(label, opts?)        // 80×30 default, no outline
```

### UML Class Diagrams

```js
import { classShape } from 'diagramz/shapes/uml'

classShape(label, {
  stereotype?: string,          // 'interface' | 'abstract' | 'enum' | custom
  fields?: Field[],             // { name, type?, visibility? }
  methods?: Method[],           // { name, params?, returns?, visibility? }
  ...ShapeOpts
})
```

Visibility: `'+'` public (default), `'-'` private, `'#'` protected, `'~'` package

### C4 Shapes

```js
import { c4Person, c4System, c4Container, c4Component, c4Database,
         c4ExternalSystem, c4ExternalContainer } from 'diagramz/shapes/c4'

c4Person(label, { description?, technology?, external?, ...ShapeOpts })
c4System(label, { description?, technology?, external?, ...ShapeOpts })
c4Container(label, { description?, technology?, ...ShapeOpts })
c4Component(label, { description?, technology?, ...ShapeOpts })
c4Database(label, { description?, technology?, ...ShapeOpts })
c4ExternalSystem(label, { description?, ...ShapeOpts })
c4ExternalContainer(label, { description?, technology?, ...ShapeOpts })
```

---

## Connections

```js
source.to(target, label?, opts?)
```

```ts
interface ConnectionOpts {
  type?: ConnectionType     // default: 'arrow'
  color?: string
  strokeWidth?: number
  strokeDash?: number[]     // e.g. [6, 4] for dashed
}

type ConnectionType =
  | 'arrow'       // solid line + open arrowhead
  | 'line'        // solid line, no arrowhead
  | 'inherit'     // solid + hollow triangle (extends)
  | 'implement'   // dashed + hollow triangle (implements)
  | 'compose'     // solid + filled diamond (composition)
  | 'aggregate'   // solid + hollow diamond (aggregation)
  | 'depend'      // dashed + open arrowhead (dependency)
```

---

## Layout

```js
import { Sugiyama } from 'diagramz/layout'

new Sugiyama({
  direction?: 'TB' | 'LR' | 'BT' | 'RL',  // default: 'TB'
  spacing?: number,                          // horizontal gap (default: 60)
  layerSpacing?: number,                     // vertical gap (default: 100)
})
```

Layout is auto-applied before rendering. All shapes get `x`, `y` assigned.

---

## Color Palettes

Palettes are just `string[]`. Shapes without explicit `fillColor` cycle through the palette; text color is auto-derived for contrast.

```js
import { palettes } from 'diagramz'

palettes.default    // ['#4A90D9', '#50B86C', '#E6854A', '#9B6FD4', '#E05B5B', '#D4A84E', '#4ABCD9', '#D94A8C']
palettes.blueprint  // ['#1565c0', '#1e88e5', '#42a5f5', '#64b5f6', '#90caf9', '#bbdefb']
palettes.earth      // ['#4e342e', '#6d4c41', '#795548', '#8d6e63', '#a1887f', '#bcaaa4']
palettes.mono       // ['#212121', '#424242', '#616161', '#757575', '#9e9e9e', '#bdbdbd']
palettes.pastel     // ['#bbdefb', '#c8e6c9', '#ffe0b2', '#e1bee7', '#fff9c4', '#b2dfdb', '#f8bbd0', '#d1c4e9']
palettes.c4         // ['#08427B', '#1168BD', '#438DD5', '#85BBF0', '#999999', '#6b9dc8']
```

Or pass custom colors:
```js
diagram('Title', { colors: ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'] })
```

---

## Examples

### Simple flowchart

```js
import { diagram } from 'diagramz'
import { rectangle, diamond, ellipse } from 'diagramz/shapes/basic'

const d = diagram('Order Flow', { colors: ['#4A90D9', '#50B86C', '#E6854A'] })

const start = d.add(ellipse('Start'))
const check = d.add(diamond('In Stock?'))
const ship = d.add(rectangle('Ship Order'))
const notify = d.add(rectangle('Notify Customer'))

start.to(check)
check.to(ship, 'Yes')
check.to(notify, 'No')

export default d
```

### UML class diagram

```js
import { diagram, palettes } from 'diagramz'
import { classShape } from 'diagramz/shapes/uml'
import { Sugiyama } from 'diagramz/layout'

const d = diagram('E-Commerce', {
  colors: palettes.pastel,
  layout: new Sugiyama({ direction: 'TB', spacing: 120, layerSpacing: 160 }),
})

const order = d.add(classShape('Order', {
  fields: [
    { name: 'id', type: 'UUID', visibility: '-' },
    { name: 'items', type: 'OrderItem[]', visibility: '-' },
  ],
  methods: [
    { name: 'addItem', params: 'product, qty', returns: 'void' },
    { name: 'submit', returns: 'void' },
  ],
}))

const repo = d.add(classShape('OrderRepository', {
  stereotype: 'interface',
  methods: [
    { name: 'findById', params: 'id', returns: 'Order' },
    { name: 'save', params: 'order', returns: 'void' },
  ],
}))

order.to(repo, '', { type: 'depend' })

export default d
```

### C4 context diagram

```js
import { diagram, palettes } from 'diagramz'
import { c4Person, c4System, c4ExternalSystem } from 'diagramz/shapes/c4'
import { Sugiyama } from 'diagramz/layout'

const d = diagram('Banking System', {
  colors: palettes.c4,
  layout: new Sugiyama({ direction: 'TB', spacing: 80, layerSpacing: 120 }),
})

const customer = d.add(c4Person('Customer', {
  description: 'A customer of the bank',
}))
const system = d.add(c4System('Internet Banking', {
  description: 'Allows customers to view\naccount information',
}))
const email = d.add(c4ExternalSystem('E-Mail System', {
  description: 'Sends e-mails',
}))

customer.to(system, 'Uses')
system.to(email, 'Sends e-mails using')

export default d
```

### With groups

```js
import { diagram } from 'diagramz'
import { rectangle } from 'diagramz/shapes/basic'

const d = diagram('Microservices', {
  colors: ['#4A90D9', '#50B86C', '#E6854A', '#9B6FD4'],
})

const frontend = d.group('Frontend', { fillColor: '#e3f2fd' })
const app = frontend.add(rectangle('Web App'))
const mobile = frontend.add(rectangle('Mobile App'))

const backend = d.group('Backend', { fillColor: '#e8f5e9' })
const api = backend.add(rectangle('API Gateway'))
const auth = backend.add(rectangle('Auth Service'))

app.to(api, 'REST')
mobile.to(api, 'REST')
api.to(auth, 'validates')

export default d
```

---

## Type Definitions

```ts
// Full bundled .d.ts below — all public types exported from 'diagramz'

interface Node {
  readonly id: string
  readonly label: string
  to(target: Node, label?: string, opts?: ConnectionOpts): Connection
}

type ConnectionType = 'arrow' | 'line' | 'inherit' | 'implement' | 'compose' | 'aggregate' | 'depend'

interface ConnectionOpts {
  type?: ConnectionType
  color?: string
  strokeWidth?: number
  strokeDash?: number[]
}

class Connection {
  readonly id: string
  readonly from: Node
  readonly target: Node
  readonly label?: string
  readonly type: ConnectionType
  readonly color?: string
  readonly strokeWidth?: number
  readonly strokeDash?: number[]
  waypoints: { x: number; y: number }[]
}

interface ShapeOpts {
  id?: string
  color?: string
  fillColor?: string
  strokeWidth?: number
  fontSize?: number
  width?: number
  height?: number
  x?: number
  y?: number
}

abstract class Shape implements Node {
  readonly id: string
  label: string
  abstract readonly type: string
  x?: number; y?: number
  width?: number; height?: number
  color?: string; fillColor?: string
  strokeWidth?: number; fontSize?: number
  to(target: Node, label?: string, opts?: ConnectionOpts): Connection
}

interface GroupOpts {
  id?: string
  color?: string
  fillColor?: string
  strokeWidth?: number
}

class Group implements Node {
  readonly id: string
  readonly label: string
  readonly children: (Shape | Group)[]
  color?: string; fillColor?: string; strokeWidth?: number
  add<T extends Shape>(shape: T): T
  group(label: string, opts?: GroupOpts): Group
  to(target: Node, label?: string, opts?: ConnectionOpts): Connection
}

interface DiagramOpts {
  layout?: Layout
  colors?: string[]
  background?: string
  description?: string
}

class Diagram {
  readonly title?: string
  readonly children: (Shape | Group)[]
  readonly connections: Connection[]
  readonly layout: Layout
  readonly colors?: string[]
  readonly background?: string
  readonly description?: string
  add<T extends Shape>(shape: T): T
  group(label: string, opts?: GroupOpts): Group
  toJSON(): unknown
  toCode(): string
}

function diagram(title?: string, opts?: DiagramOpts): Diagram
function diagramFromJson(json: string): Diagram

// Palettes
const palettes: Record<string, string[]>
function contrastColor(hex: string): string

// Layout
type Direction = 'TB' | 'LR' | 'BT' | 'RL'
class Sugiyama {
  constructor(opts?: { direction?: Direction; spacing?: number; layerSpacing?: number })
}

// Basic shapes
function rectangle(label: string, opts?: ShapeOpts): Shape
function ellipse(label: string, opts?: ShapeOpts): Shape
function diamond(label: string, opts?: ShapeOpts): Shape
function text(label: string, opts?: ShapeOpts): Shape

// UML
type Visibility = '+' | '-' | '#' | '~'
interface Field { name: string; type?: string; visibility?: Visibility }
interface Method { name: string; params?: string; returns?: string; visibility?: Visibility }
interface ClassShapeOpts extends ShapeOpts {
  stereotype?: string
  fields?: Field[]
  methods?: Method[]
}
function classShape(label: string, opts?: ClassShapeOpts): ClassShape

// C4
interface C4ShapeOpts extends ShapeOpts {
  description?: string
  technology?: string
  external?: boolean
}
function c4Person(label: string, opts?: C4ShapeOpts): C4PersonShape
function c4System(label: string, opts?: C4ShapeOpts): C4BoxShape
function c4ExternalSystem(label: string, opts?: C4ShapeOpts): C4BoxShape
function c4Container(label: string, opts?: C4ShapeOpts): C4BoxShape
function c4ExternalContainer(label: string, opts?: C4ShapeOpts): C4BoxShape
function c4Component(label: string, opts?: C4ShapeOpts): C4BoxShape
function c4Database(label: string, opts?: C4ShapeOpts): C4BoxShape
```
