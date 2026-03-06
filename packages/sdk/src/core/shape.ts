import type { Node, ConnectionRegistrar } from './node.js'
import { Connection, type ConnectionOpts } from './connection.js'
import { generateId } from './id.js'

export interface ShapeOpts {
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

export abstract class Shape implements Node {
  readonly id: string
  label: string
  abstract readonly type: string
  x?: number
  y?: number
  width?: number
  height?: number
  color?: string
  fillColor?: string
  strokeWidth?: number
  fontSize?: number

  /** @internal */
  _register?: ConnectionRegistrar

  constructor(label: string, opts?: ShapeOpts) {
    this.id = opts?.id ?? generateId('e')
    this.label = label
    this.x = opts?.x
    this.y = opts?.y
    this.width = opts?.width
    this.height = opts?.height
    this.color = opts?.color
    this.fillColor = opts?.fillColor
    this.strokeWidth = opts?.strokeWidth
    this.fontSize = opts?.fontSize
  }

  abstract outline(w: number, h: number): Float64Array
  abstract clipPoint(w: number, h: number, angle: number): [number, number]
  abstract labelPos(w: number, h: number): [number, number]
  abstract get defaultSize(): [number, number]

  to(target: Node, label?: string, opts?: ConnectionOpts): Connection {
    const conn = new Connection(generateId('c'), this, target, label, opts)
    const register = this._register ?? (target as Shape)._register
    register?.(conn)
    return conn
  }

  toJSON(): unknown {
    const json: Record<string, unknown> = {
      id: this.id,
      type: this.type,
      label: this.label,
    }
    if (this.x != null) json.x = this.x
    if (this.y != null) json.y = this.y
    if (this.width != null) json.width = this.width
    if (this.height != null) json.height = this.height
    if (this.color) json.color = this.color
    if (this.fillColor) json.fillColor = this.fillColor
    if (this.strokeWidth != null) json.strokeWidth = this.strokeWidth
    if (this.fontSize != null) json.fontSize = this.fontSize
    return json
  }
}

export function resolveSize(shape: Shape): [number, number] {
  if (shape.width != null && shape.height != null) {
    return [shape.width, shape.height]
  }
  const fontSize = shape.fontSize ?? 16
  const lines = shape.label.split('\n')
  const maxLineLen = Math.max(...lines.map(l => l.length))
  const textW = maxLineLen * fontSize * 0.6
  const textH = lines.length * fontSize * 1.4
  const [dw, dh] = shape.defaultSize
  return [
    shape.width ?? Math.max(dw, textW + 40),
    shape.height ?? Math.max(dh, textH + 20),
  ]
}
