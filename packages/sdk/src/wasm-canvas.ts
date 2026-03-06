import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Canvas, CanvasFactory } from './engines/canvas.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// WASM glue is CJS (.cjs) — load via createRequire
// Try dist/wasm/ (published) then fall back to src/wasm/ (dev)
const require = createRequire(import.meta.url)
let wasmMod: { Canvas: unknown }
try {
  wasmMod = require(join(__dirname, 'wasm', 'diagramz_renderer.cjs'))
} catch {
  wasmMod = require(join(__dirname, '..', 'src', 'wasm', 'diagramz_renderer.cjs'))
}
const WasmCanvas = wasmMod.Canvas as {
  new (width: number, height: number): WasmCanvasInstance
}

interface WasmCanvasInstance {
  clear(color: number): void
  fillPath(segs: Float64Array, color: number): void
  strokePath(segs: Float64Array, color: number, width: number): void
  strokePathDashed(segs: Float64Array, color: number, width: number, dash: number): void
  drawText(text: string, x: number, y: number, size: number, color: number, font: number): void
  measureText(text: string, size: number, font: number): Float32Array
  toPng(): Uint8Array
  toImageData(): Uint8Array
  free(): void
}

class WasmCanvasAdapter implements Canvas {
  private inner: WasmCanvasInstance

  constructor(width: number, height: number) {
    this.inner = new WasmCanvas(width, height)
    this.inner.clear(0xffffffff) // white background
  }

  fillPath(segs: Float64Array, color: number): void {
    this.inner.fillPath(segs, color)
  }

  strokePath(segs: Float64Array, color: number, width: number): void {
    this.inner.strokePath(segs, color, width)
  }

  strokePathDashed(segs: Float64Array, color: number, width: number, dash: number): void {
    this.inner.strokePathDashed(segs, color, width, dash)
  }

  drawText(text: string, x: number, y: number, size: number, color: number, font: number): void {
    this.inner.drawText(text, x, y, size, color, font)
  }

  measureText(text: string, size: number, font: number): [number, number] {
    const result = this.inner.measureText(text, size, font)
    return [result[0], result[1]]
  }

  toPng(): Uint8Array {
    return this.inner.toPng()
  }

  toImageData(): Uint8Array {
    return this.inner.toImageData()
  }
}

export const wasmCanvasFactory: CanvasFactory = {
  create(width: number, height: number): Canvas {
    return new WasmCanvasAdapter(width, height)
  },
}
