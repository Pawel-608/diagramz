export interface Canvas {
  fillPath(segs: Float64Array, color: number): void
  strokePath(segs: Float64Array, color: number, width: number): void
  strokePathDashed(segs: Float64Array, color: number, width: number, dash: number): void
  /** Draw a shape outline: fill + stroke. In rough mode, uses hachure fill + wobbled stroke. */
  fillAndStrokePath(segs: Float64Array, fillColor: number, strokeColor: number, strokeWidth: number): void
  drawText(text: string, x: number, y: number, size: number, color: number, font: number): void
  measureText(text: string, size: number, font: number): [number, number]
}

export interface RenderTarget extends Canvas {
  toPng(): Uint8Array
  toImageData(): Uint8Array
}

export interface RenderTargetFactory {
  create(width: number, height: number): RenderTarget
}
