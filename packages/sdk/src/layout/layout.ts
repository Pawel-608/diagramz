import type { Diagram } from '../core/diagram.js'

export interface Layout {
  apply(diagram: Diagram): void
  toJSON(): unknown
}
