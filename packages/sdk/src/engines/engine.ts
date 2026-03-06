import type { Canvas, CanvasFactory } from './canvas.js'
import type { Diagram } from '../core/diagram.js'
import type { Shape } from '../core/shape.js'
import type { Group } from '../core/group.js'
import type { Connection } from '../core/connection.js'
import type { Point } from '../render/connections.js'
import { renderDiagram, type RenderOpts } from '../render/loop.js'

export abstract class Engine {
  abstract readonly name: string
  abstract readonly font: number

  abstract renderElement(
    shape: Shape,
    w: number,
    h: number,
    offsetX: number,
    offsetY: number,
    canvas: Canvas,
  ): void

  abstract renderGroup(
    group: Group,
    bounds: { x: number; y: number; w: number; h: number },
    offsetX: number,
    offsetY: number,
    canvas: Canvas,
  ): void

  abstract renderConnection(
    linePath: Float64Array,
    conn: Connection,
    from: Point,
    to: Point,
    angle: number,
    canvas: Canvas,
  ): void

  render(diagram: Diagram, factory: CanvasFactory, opts?: RenderOpts): Uint8Array {
    return renderDiagram(diagram, this, factory, opts)
  }

  toJSON(): unknown {
    return { name: this.name }
  }
}
