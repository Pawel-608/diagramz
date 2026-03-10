import type { Node } from './node.js'
import type { Canvas } from '../engines/canvas.js'
import { DefaultPathBuilder } from './path.js'
import { parseColor } from './color.js'
import {
  orthogonalRoute,
  arrowheadPath,
  triangleHeadPath,
  diamondDecorPath,
  type Point,
} from '../render/connections.js'

export type ConnectionType = 'arrow' | 'line' | 'inherit' | 'implement' | 'compose' | 'aggregate' | 'depend'

export interface ConnectionOpts {
  type?: ConnectionType
  color?: string
  strokeWidth?: number
  strokeDash?: number[]
}

export class Connection {
  readonly id: string
  readonly from: Node
  readonly target: Node
  readonly label?: string
  readonly type: ConnectionType
  readonly color?: string
  readonly strokeWidth?: number
  readonly strokeDash?: number[]
  /** Set by layout — intermediate route points for multi-layer edges */
  waypoints: { x: number; y: number }[] = []
  /** Set by port assignment — fractional position (0–1) along exit side */
  fromPort: number = 0.5
  /** Set by port assignment — fractional position (0–1) along entry side */
  toPort: number = 0.5

  constructor(id: string, from: Node, target: Node, label?: string, opts?: ConnectionOpts) {
    this.id = id
    this.from = from
    this.target = target
    this.label = label
    this.type = opts?.type ?? 'arrow'
    this.color = opts?.color
    this.strokeWidth = opts?.strokeWidth
    this.strokeDash = opts?.strokeDash
  }

  render(canvas: Canvas, offset: { x: number; y: number }): void {
    const route = orthogonalRoute(this.from, this.target, offset, this.waypoints ?? [], this.fromPort, this.toPort)
    const { from: fromPt, to: toPt, path: linePath, angle } = route

    const color = parseColor(this.color ?? '#333333')
    const sw = this.strokeWidth ?? 1.5

    const dashed = this.strokeDash || this.type === 'implement' || this.type === 'depend'
    if (dashed) {
      canvas.strokePathDashed(linePath, color, sw, this.strokeDash?.[0] ?? 6)
    } else {
      canvas.strokePath(linePath, color, sw)
    }

    const t = this.type
    if (t === 'arrow' || t === 'depend') {
      canvas.strokePath(arrowheadPath(toPt, angle, 12), color, 2)
    } else if (t === 'inherit' || t === 'implement') {
      const tri = triangleHeadPath(toPt, angle, 12)
      canvas.fillPath(tri, 0xffffffff)
      canvas.strokePath(tri, color, 1.5)
    } else if (t === 'compose') {
      const dm = diamondDecorPath(fromPt, angle, 8)
      canvas.fillPath(dm, color)
      canvas.strokePath(dm, color, 1)
    } else if (t === 'aggregate') {
      const dm = diamondDecorPath(fromPt, angle, 8)
      canvas.fillPath(dm, 0xffffffff)
      canvas.strokePath(dm, color, 1.5)
    }

    if (this.label) {
      const labelPt = route.midPoint
      const [tw] = canvas.measureText(this.label, 12, 0)
      const pad = 3
      const bgRect = new DefaultPathBuilder()
        .moveTo(labelPt.x - tw / 2 - pad, labelPt.y - 8 - pad)
        .lineTo(labelPt.x + tw / 2 + pad, labelPt.y - 8 - pad)
        .lineTo(labelPt.x + tw / 2 + pad, labelPt.y + 4 + pad)
        .lineTo(labelPt.x - tw / 2 - pad, labelPt.y + 4 + pad)
        .close().build()
      canvas.fillPath(bgRect, 0xf8f8f8e0)
      canvas.drawText(this.label, labelPt.x, labelPt.y, 12, parseColor(this.color ?? '#000000'), 0)
    }
  }

  toJSON() {
    const json: Record<string, unknown> = {
      id: this.id,
      from: this.from.id,
      to: this.target.id,
      type: this.type,
    }
    if (this.label) json.label = this.label
    if (this.color) json.color = this.color
    if (this.strokeWidth != null) json.strokeWidth = this.strokeWidth
    if (this.strokeDash) json.strokeDash = this.strokeDash
    return json
  }
}

// ---------------------------------------------------------------------------
// Connection type presets — pass to .to() as opts
// ---------------------------------------------------------------------------

type StyleOpts = Omit<ConnectionOpts, 'type'>

export function arrow(opts?: StyleOpts): ConnectionOpts { return { ...opts, type: 'arrow' } }
export function line(opts?: StyleOpts): ConnectionOpts { return { ...opts, type: 'line' } }
export function inherit(opts?: StyleOpts): ConnectionOpts { return { ...opts, type: 'inherit' } }
export function implement(opts?: StyleOpts): ConnectionOpts { return { ...opts, type: 'implement' } }
export function compose(opts?: StyleOpts): ConnectionOpts { return { ...opts, type: 'compose' } }
export function aggregate(opts?: StyleOpts): ConnectionOpts { return { ...opts, type: 'aggregate' } }
export function depend(opts?: StyleOpts): ConnectionOpts { return { ...opts, type: 'depend' } }
