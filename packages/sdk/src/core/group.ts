import type { Node, ConnectionRegistrar } from './node.js'
import type { Canvas } from '../engines/canvas.js'
import { Connection, type ConnectionOpts } from './connection.js'
import { Shape, resolveSize } from './shape.js'
import { generateId } from './id.js'
import { DefaultPathBuilder } from './path.js'
import { parseColor } from './color.js'

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

  to(target: Node, labelOrOpts?: string | ConnectionOpts, opts?: ConnectionOpts): Connection {
    const label = typeof labelOrOpts === 'string' ? labelOrOpts : undefined
    const options = typeof labelOrOpts === 'object' ? labelOrOpts : opts
    const conn = new Connection(generateId('c'), this, target, label, options)
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

  render(canvas: Canvas, offsetX: number, offsetY: number): void {
    const b = this.bounds()
    if (!b) return
    const x = b.x + offsetX
    const y = b.y + offsetY
    const stroke = parseColor(this.color ?? '#cccccc')
    const sw = this.strokeWidth ?? 1

    const rect = new DefaultPathBuilder()
      .moveTo(x, y)
      .lineTo(x + b.w, y)
      .lineTo(x + b.w, y + b.h)
      .lineTo(x, y + b.h)
      .close()
      .build()

    if (this.fillColor) {
      canvas.fillPath(rect, parseColor(this.fillColor))
    }
    canvas.strokePath(rect, stroke, sw)
    canvas.drawText(this.label, x + 8, y + 16, 12, parseColor(this.color ?? '#666666'), 0)
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
