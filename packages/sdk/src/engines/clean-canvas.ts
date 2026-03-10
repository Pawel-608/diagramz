import type { Canvas, RenderTarget } from './canvas.js'

export class CleanCanvas implements Canvas {
  readonly font = 1

  constructor(private target: RenderTarget) {}

  fillPath(segs: Float64Array, color: number): void {
    this.target.fillPath(segs, color)
  }

  strokePath(segs: Float64Array, color: number, width: number): void {
    this.target.strokePath(segs, color, width)
  }

  strokePathDashed(segs: Float64Array, color: number, width: number, dash: number): void {
    this.target.strokePathDashed(segs, color, width, dash)
  }

  fillAndStrokePath(segs: Float64Array, fillColor: number, strokeColor: number, strokeWidth: number): void {
    this.target.fillPath(segs, fillColor)
    this.target.strokePath(segs, strokeColor, strokeWidth)
  }

  drawText(text: string, x: number, y: number, size: number, color: number, _font: number): void {
    this.target.drawText(text, x, y, size, color, this.font)
  }

  measureText(text: string, size: number, _font: number): [number, number] {
    return this.target.measureText(text, size, this.font)
  }
}
