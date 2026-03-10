import type { Canvas, RenderTargetFactory } from './canvas.js'
import type { Diagram } from '../core/diagram.js'
import { renderDiagram, type RenderOpts } from '../render/loop.js'

export abstract class Engine {
  abstract readonly name: string

  abstract createCanvas(target: Canvas): Canvas

  render(diagram: Diagram, factory: RenderTargetFactory, opts?: RenderOpts): Uint8Array {
    return renderDiagram(diagram, (t) => this.createCanvas(t), factory, opts)
  }

  toJSON(): unknown {
    return { name: this.name }
  }
}
