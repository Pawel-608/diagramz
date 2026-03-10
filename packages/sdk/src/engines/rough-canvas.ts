import type { Canvas } from './canvas.js'
import { DefaultPathBuilder, MOVE_TO, LINE_TO, CUBIC_TO, CLOSE } from '../core/path.js'
import { colorWithAlpha } from '../core/color.js'

class SeededRng {
  private state: number

  constructor(seed: number) {
    this.state = seed || 1
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) & 0x7fffffff
    return this.state / 0x7fffffff
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }
}

export interface RoughCanvasOpts {
  roughness?: number
  seed?: number
}

export class RoughCanvas implements Canvas {
  readonly font = 0
  private readonly roughness: number
  private readonly rng: SeededRng

  constructor(private target: Canvas, opts?: RoughCanvasOpts) {
    this.roughness = opts?.roughness ?? 1.5
    this.rng = new SeededRng(opts?.seed ?? 1)
  }

  fillPath(segs: Float64Array, color: number): void {
    this.target.fillPath(segs, color)
  }

  strokePath(segs: Float64Array, color: number, width: number): void {
    for (let pass = 0; pass < 2; pass++) {
      const wobbled = wobblePath(segs, this.roughness, this.rng)
      this.target.strokePath(wobbled, color, width)
    }
  }

  strokePathDashed(segs: Float64Array, color: number, width: number, dash: number): void {
    this.target.strokePathDashed(segs, color, width, dash)
  }

  fillAndStrokePath(segs: Float64Array, fillColor: number, strokeColor: number, strokeWidth: number): void {
    // Hachure fill
    const hachureColor = colorWithAlpha(fillColor, 0.7)
    const { vertices, w, h } = extractBounds(segs)
    if (vertices.length >= 3) {
      const lines = generateHachure(vertices, w, h, this.rng)
      for (const line of lines) {
        this.target.strokePath(line, hachureColor, 1)
      }
    }

    // Double-pass wobbled outline stroke
    for (let pass = 0; pass < 2; pass++) {
      const wobbled = wobblePath(segs, this.roughness, this.rng)
      this.target.strokePath(wobbled, strokeColor, strokeWidth)
    }
  }

  drawText(text: string, x: number, y: number, size: number, color: number, _font: number): void {
    this.target.drawText(text, x, y, size, color, this.font)
  }

  measureText(text: string, size: number, _font: number): [number, number] {
    return this.target.measureText(text, size, this.font)
  }
}

function extractBounds(segs: Float64Array): { vertices: [number, number][]; w: number; h: number } {
  const vertices: [number, number][] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let i = 0
  while (i < segs.length) {
    const cmd = segs[i]
    if (cmd === MOVE_TO || cmd === LINE_TO) {
      const x = segs[i + 1], y = segs[i + 2]
      vertices.push([x, y])
      minX = Math.min(minX, x); minY = Math.min(minY, y)
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
      i += 3
    } else if (cmd === CUBIC_TO) {
      const x = segs[i + 5], y = segs[i + 6]
      vertices.push([x, y])
      minX = Math.min(minX, x); minY = Math.min(minY, y)
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
      i += 7
    } else {
      i += 1
    }
  }
  const w = isFinite(maxX) ? maxX - minX : 0
  const h = isFinite(maxY) ? maxY - minY : 0
  return { vertices, w, h }
}

function wobblePath(path: Float64Array, roughness: number, rng: SeededRng): Float64Array {
  const result: number[] = []
  let i = 0
  while (i < path.length) {
    const cmd = path[i]
    if (cmd === MOVE_TO) {
      result.push(MOVE_TO, path[i + 1] + rng.range(-roughness, roughness), path[i + 2] + rng.range(-roughness, roughness))
      i += 3
    } else if (cmd === LINE_TO) {
      result.push(LINE_TO, path[i + 1] + rng.range(-roughness, roughness), path[i + 2] + rng.range(-roughness, roughness))
      i += 3
    } else if (cmd === CUBIC_TO) {
      result.push(
        CUBIC_TO,
        path[i + 1] + rng.range(-roughness, roughness),
        path[i + 2] + rng.range(-roughness, roughness),
        path[i + 3] + rng.range(-roughness, roughness),
        path[i + 4] + rng.range(-roughness, roughness),
        path[i + 5] + rng.range(-roughness, roughness),
        path[i + 6] + rng.range(-roughness, roughness),
      )
      i += 7
    } else if (cmd === CLOSE) {
      result.push(CLOSE)
      i += 1
    } else {
      i += 1
    }
  }
  return new Float64Array(result)
}

function generateHachure(
  vertices: [number, number][],
  w: number,
  h: number,
  rng: SeededRng,
): Float64Array[] {
  const lines: Float64Array[] = []
  const gap = 8
  const angle = -Math.PI / 4

  const cos = Math.cos(angle), sin = Math.sin(angle)
  const maxDim = Math.max(w, h) * 2

  for (let d = -maxDim; d < maxDim; d += gap) {
    const lx = cos * d, ly = sin * d
    const dx = -sin, dy = cos

    const intersections: number[] = []
    for (let j = 0; j < vertices.length; j++) {
      const [x1, y1] = vertices[j]
      const [x2, y2] = vertices[(j + 1) % vertices.length]

      const denom = (x2 - x1) * dy - (y2 - y1) * dx
      if (Math.abs(denom) < 1e-10) continue

      const t = ((lx - x1) * dy - (ly - y1) * dx) / denom
      if (t < 0 || t > 1) continue

      const ix = x1 + t * (x2 - x1)
      const iy = y1 + t * (y2 - y1)
      const s = dx !== 0 ? (ix - lx) / dx : (iy - ly) / dy
      intersections.push(s)
    }

    intersections.sort((a, b) => a - b)

    for (let j = 0; j + 1 < intersections.length; j += 2) {
      const s1 = intersections[j], s2 = intersections[j + 1]
      const x1 = lx + s1 * dx + rng.range(-0.5, 0.5)
      const y1 = ly + s1 * dy + rng.range(-0.5, 0.5)
      const x2 = lx + s2 * dx + rng.range(-0.5, 0.5)
      const y2 = ly + s2 * dy + rng.range(-0.5, 0.5)
      lines.push(new DefaultPathBuilder().moveTo(x1, y1).lineTo(x2, y2).build())
    }
  }

  return lines
}
