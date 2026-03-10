import type { Node } from './node.js'
import { Connection, type ConnectionType } from './connection.js'
import { Shape, type ShapeOpts } from './shape.js'
import { Group, type GroupOpts } from './group.js'
import type { Layout } from '../layout/layout.js'
import type { Engine } from '../engines/engine.js'
import type { RenderTargetFactory } from '../engines/canvas.js'
import { Sugiyama, type Direction } from '../layout/sugiyama.js'
import { rectangle as _rect, ellipse as _ellipse, diamond as _diamond, text as _text } from '../shapes/basic.js'
import { ClassShape, type ClassShapeOpts } from '../shapes/uml.js'
import { C4PersonShape, C4BoxShape, type C4ShapeOpts } from '../shapes/c4.js'

export interface DiagramOpts {
  layout?: Layout
  colors?: string[]
  background?: string
  description?: string
}

export class Diagram {
  readonly title?: string
  readonly children: (Shape | Group)[] = []
  readonly connections: Connection[] = []
  readonly layout: Layout
  readonly colors?: string[]
  readonly background?: string
  readonly description?: string

  constructor(title?: string, opts?: DiagramOpts) {
    this.title = title
    this.layout = opts?.layout ?? new Sugiyama()
    this.colors = opts?.colors
    this.background = opts?.background
    this.description = opts?.description
  }

  private registrar = (conn: Connection) => {
    this.connections.push(conn)
  }

  add<T extends Shape>(shape: T): T {
    this.children.push(shape)
    shape._register = this.registrar
    return shape
  }

  group(label: string, opts?: GroupOpts): Group {
    const g = new Group(label, opts)
    this.children.push(g)
    g._register = this.registrar
    return g
  }

  render(engine: Engine, factory: RenderTargetFactory): Uint8Array {
    return engine.render(this, factory)
  }

  toJson(): string {
    return JSON.stringify(this)
  }

  toJSON(): unknown {
    const json: Record<string, unknown> = {
      title: this.title,
      layout: this.layout.toJSON(),
      children: this.children.map(c => c.toJSON()),
      connections: this.connections.map(c => c.toJSON()),
    }
    if (this.colors) json.colors = this.colors
    if (this.background) json.background = this.background
    if (this.description) json.description = this.description
    return json
  }

  toCode(): string {
    return generateCode(this)
  }
}

export function diagram(title?: string, opts?: DiagramOpts): Diagram {
  return new Diagram(title, opts)
}

// --- diagramFromJson ---

interface JsonShape {
  id: string
  type: string
  label: string
  x?: number
  y?: number
  width?: number
  height?: number
  color?: string
  fillColor?: string
  strokeWidth?: number
  fontSize?: number
  // UML class fields
  stereotype?: string
  fields?: string[]
  methods?: string[]
  // C4 fields
  description?: string
  technology?: string
  external?: boolean
}

interface JsonGroup {
  type: 'group'
  id: string
  label: string
  children?: (JsonShape | JsonGroup)[]
  color?: string
  fillColor?: string
  strokeWidth?: number
}

interface JsonConnection {
  id: string
  from: string
  to: string
  type?: ConnectionType
  label?: string
  color?: string
  strokeWidth?: number
  strokeDash?: number[]
}

interface JsonDiagram {
  title?: string
  colors?: string[]
  background?: string
  description?: string
  layout?: { name: string; direction?: Direction; spacing?: number; layerSpacing?: number }
  children?: (JsonShape | JsonGroup)[]
  connections?: JsonConnection[]
}

export function diagramFromJson(json: string): Diagram {
  const data: JsonDiagram = JSON.parse(json)

  let layout: Layout | undefined
  if (data.layout) {
    layout = new Sugiyama({
      direction: data.layout.direction,
      spacing: data.layout.spacing,
      layerSpacing: data.layout.layerSpacing,
    })
  }

  const d = new Diagram(data.title, { layout, colors: data.colors, background: data.background, description: data.description })
  const nodeMap = new Map<string, Node>()

  function addChildren(parent: Diagram | Group, children: (JsonShape | JsonGroup)[]) {
    for (const child of children) {
      if (child.type === 'group' || 'children' in child) {
        const gc = child as JsonGroup
        const g = parent.group(gc.label, {
          id: gc.id,
          color: gc.color,
          fillColor: gc.fillColor,
          strokeWidth: gc.strokeWidth,
        })
        nodeMap.set(g.id, g)
        if (gc.children) addChildren(g, gc.children)
      } else {
        const sc = child as JsonShape
        const shape = createShapeFromType(sc.type, sc.label, {
          id: sc.id,
          x: sc.x,
          y: sc.y,
          width: sc.width,
          height: sc.height,
          color: sc.color,
          fillColor: sc.fillColor,
          strokeWidth: sc.strokeWidth,
          fontSize: sc.fontSize,
          // UML class
          stereotype: sc.stereotype,
          fields: sc.fields,
          methods: sc.methods,
          // C4
          description: sc.description,
          technology: sc.technology,
          external: sc.external,
        } as ShapeOpts)
        parent.add(shape)
        nodeMap.set(shape.id, shape)
      }
    }
  }

  if (data.children) addChildren(d, data.children)

  for (const conn of data.connections ?? []) {
    const from = nodeMap.get(conn.from)
    const to = nodeMap.get(conn.to)
    if (from && to) {
      from.to(to, conn.label, {
        type: conn.type,
        color: conn.color,
        strokeWidth: conn.strokeWidth,
        strokeDash: conn.strokeDash,
      })
    }
  }

  return d
}

// Shape factory registry — allows extending with new shape types
const shapeFactories = new Map<string, (label: string, opts?: ShapeOpts) => Shape>()

export function registerShapeFactory(type: string, factory: (label: string, opts?: ShapeOpts) => Shape): void {
  shapeFactories.set(type, factory)
}

function createShapeFromType(type: string, label: string, opts?: ShapeOpts): Shape {
  const factory = shapeFactories.get(type)
  if (factory) return factory(label, opts)

  switch (type) {
    case 'rectangle': return _rect(label, opts)
    case 'ellipse': return _ellipse(label, opts)
    case 'diamond': return _diamond(label, opts)
    case 'text': return _text(label, opts)
    case 'class': return new ClassShape(label, opts as ClassShapeOpts)
    case 'c4:person': return new C4PersonShape(label, opts as C4ShapeOpts)
    case 'c4:system':
    case 'c4:container':
    case 'c4:component':
    case 'c4:database': return new C4BoxShape(type as 'c4:system' | 'c4:container' | 'c4:component' | 'c4:database', label, opts as C4ShapeOpts)
    default: return _rect(label, opts)
  }
}

// --- toCode ---

function generateCode(d: Diagram): string {
  const lines: string[] = []
  const varNames = new Map<string, string>()
  let varCounter = 0

  function toVarName(label: string): string {
    const base = label
      .replace(/[^a-zA-Z0-9]/g, ' ')
      .trim()
      .split(/\s+/)
      .map((w, i) => i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())
      .join('')
    if (!base) return `node${varCounter++}`
    if (varNames.has(base)) return `${base}${varCounter++}`
    return base
  }

  lines.push(`import { diagram } from 'diagramz'`)
  lines.push(`import { rectangle, ellipse, diamond, text } from 'diagramz/shapes/basic'`)

  const layoutJson = d.layout.toJSON() as Record<string, unknown>
  if (layoutJson.name === 'sugiyama' && layoutJson.direction !== 'TB') {
    lines.push(`import { Sugiyama } from 'diagramz/layout'`)
  }

  lines.push('')

  // Diagram creation
  const diagOpts: string[] = []
  if (layoutJson.direction && layoutJson.direction !== 'TB') {
    diagOpts.push(`layout: new Sugiyama({ direction: "${layoutJson.direction}" })`)
  }
  if (d.colors) {
    diagOpts.push(`colors: [${d.colors.map(c => `"${c}"`).join(', ')}]`)
  }
  if (d.background) {
    diagOpts.push(`background: "${d.background}"`)
  }
  if (d.description) {
    diagOpts.push(`description: ${JSON.stringify(d.description)}`)
  }
  const optsStr = diagOpts.length > 0 ? `, { ${diagOpts.join(', ')} }` : ''
  lines.push(`const d = diagram(${d.title ? `"${d.title}"` : ''}${optsStr})`)
  lines.push('')

  function emitChildren(children: (Shape | Group)[], parentVar: string) {
    for (const child of children) {
      if (child instanceof Group) {
        const gVar = toVarName(child.label)
        varNames.set(child.id, gVar)
        const opts: string[] = []
        if (child.color) opts.push(`color: "${child.color}"`)
        if (child.fillColor) opts.push(`fillColor: "${child.fillColor}"`)
        const optsStr = opts.length > 0 ? `, { ${opts.join(', ')} }` : ''
        lines.push(`const ${gVar} = ${parentVar}.group("${child.label}"${optsStr})`)
        emitChildren(child.children, gVar)
      } else {
        const sVar = toVarName(child.label)
        varNames.set(child.id, sVar)
        const opts: string[] = []
        if (child.color) opts.push(`color: "${child.color}"`)
        if (child.fillColor) opts.push(`fillColor: "${child.fillColor}"`)
        const optsStr = opts.length > 0 ? `, { ${opts.join(', ')} }` : ''
        lines.push(`const ${sVar} = ${parentVar}.add(${child.type}("${child.label}"${optsStr}))`)
      }
    }
  }

  emitChildren(d.children, 'd')

  if (d.connections.length > 0) {
    lines.push('')
    for (const conn of d.connections) {
      const fromVar = varNames.get(conn.from.id) ?? 'unknown'
      const toVar = varNames.get(conn.target.id) ?? 'unknown'
      const args: string[] = [toVar]
      if (conn.label) args.push(`"${conn.label}"`)
      if (conn.type !== 'arrow' || conn.color || conn.strokeDash) {
        const opts: string[] = []
        if (conn.type !== 'arrow') opts.push(`type: "${conn.type}"`)
        if (conn.color) opts.push(`color: "${conn.color}"`)
        if (conn.strokeDash) opts.push(`strokeDash: [${conn.strokeDash.join(', ')}]`)
        args.push(`{ ${opts.join(', ')} }`)
      }
      lines.push(`${fromVar}.to(${args.join(', ')})`)
    }
  }

  lines.push('')
  return lines.join('\n')
}
