import { Engine } from './engine.js'
import type { Canvas } from './canvas.js'
import { RoughCanvas } from './rough-canvas.js'

export interface RoughOpts {
  roughness?: number
  seed?: number
}

export class RoughEngine extends Engine {
  readonly name = 'rough'
  readonly roughness: number
  readonly seed: number

  constructor(opts?: RoughOpts) {
    super()
    this.roughness = opts?.roughness ?? 1.5
    this.seed = opts?.seed ?? 1
  }

  createCanvas(target: Canvas): Canvas {
    return new RoughCanvas(target, { roughness: this.roughness, seed: this.seed })
  }

  override toJSON(): unknown {
    return { name: this.name, roughness: this.roughness, seed: this.seed }
  }
}
