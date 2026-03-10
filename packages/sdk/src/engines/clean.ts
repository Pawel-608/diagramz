import { Engine } from './engine.js'
import type { Canvas, RenderTarget } from './canvas.js'
import { CleanCanvas } from './clean-canvas.js'

export class CleanEngine extends Engine {
  readonly name = 'clean'

  createCanvas(target: RenderTarget): Canvas {
    return new CleanCanvas(target)
  }
}
