import type { Node } from './node.js'

export type ConnectionType = 'arrow' | 'line'

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
