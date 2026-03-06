export interface Canvas {
  fillPath(segs: Float64Array, color: number): void
  strokePath(segs: Float64Array, color: number, width: number): void
  strokePathDashed(segs: Float64Array, color: number, width: number, dash: number): void
  drawText(text: string, x: number, y: number, size: number, color: number, font: number): void
  measureText(text: string, size: number, font: number): [number, number]
  toPng(): Uint8Array
  toImageData(): Uint8Array
}

export interface CanvasFactory {
  create(width: number, height: number): Canvas
}
