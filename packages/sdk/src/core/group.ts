import type { Node, ConnectionRegistrar } from './node.js'
import { Connection, type ConnectionOpts } from './connection.js'
import { Shape, resolveSize } from './shape.js'
import { generateId } from './id.js'

export interface GroupOpts {
  id?: string
  color?: string
  fillColor?: string
  strokeWidth?: number
}

export class Group implements Node {
  readonly id: string
  readonly label: string
  readonly children: (Shape | Group)[] = []
  color?: string
  fillColor?: string
  strokeWidth?: number

  /** @internal */
  _register?: ConnectionRegistrar

  constructor(label: string, opts?: GroupOpts) {
    this.id = opts?.id ?? generateId('g')
    this.label = label
    this.color = opts?.color
    this.fillColor = opts?.fillColor
    this.strokeWidth = opts?.strokeWidth
  }

  add<T extends Shape>(shape: T): T {
    this.children.push(shape)
    shape._register = this._register
    return shape
  }

  group(label: string, opts?: GroupOpts): Group {
    const g = new Group(label, opts)
    this.children.push(g)
    g._register = this._register
    return g
  }

  to(target: Node, label?: string, opts?: ConnectionOpts): Connection {
    const conn = new Connection(generateId('c'), this, target, label, opts)
    const register = this._register ?? (target as Group)._register
    register?.(conn)
    return conn
  }

  bounds(): { x: number; y: number; w: number; h: number } | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const child of this.children) {
      if (child instanceof Group) {
        const b = child.bounds()
        if (!b) continue
        minX = Math.min(minX, b.x)
        minY = Math.min(minY, b.y)
        maxX = Math.max(maxX, b.x + b.w)
        maxY = Math.max(maxY, b.y + b.h)
      } else {
        const [w, h] = resolveSize(child)
        const x = child.x ?? 0
        const y = child.y ?? 0
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x + w)
        maxY = Math.max(maxY, y + h)
      }
    }
    if (!isFinite(minX)) return null
    const pad = 20
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
  }

  toJSON(): unknown {
    const json: Record<string, unknown> = {
      type: 'group',
      id: this.id,
      label: this.label,
      children: this.children.map(c => c.toJSON()),
    }
    if (this.color) json.color = this.color
    if (this.fillColor) json.fillColor = this.fillColor
    if (this.strokeWidth != null) json.strokeWidth = this.strokeWidth
    return json
  }
}
