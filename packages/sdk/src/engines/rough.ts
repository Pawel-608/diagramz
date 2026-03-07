import { Engine } from './engine.js'
import type { Canvas } from './canvas.js'
import type { Shape } from '../core/shape.js'
import type { Group } from '../core/group.js'
import type { Connection } from '../core/connection.js'
import type { Point } from '../render/connections.js'
import { PathBuilder, translatePath, MOVE_TO, LINE_TO, CUBIC_TO, CLOSE } from '../core/path.js'
import { parseColor, colorWithAlpha } from '../core/color.js'
import { arrowheadPath } from '../render/connections.js'

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

export interface RoughOpts {
  roughness?: number
  seed?: number
}

export class RoughEngine extends Engine {
  readonly name = 'rough'
  readonly font = 0
  readonly roughness: number
  readonly seed: number

  constructor(opts?: RoughOpts) {
    super()
    this.roughness = opts?.roughness ?? 1.5
    this.seed = opts?.seed ?? 1
  }

  renderElement(
    shape: Shape,
    w: number,
    h: number,
    offsetX: number,
    offsetY: number,
    canvas: Canvas,
  ): void {
    const x = (shape.x ?? 0) + offsetX
    const y = (shape.y ?? 0) + offsetY
    const outline = shape.outline(w, h)

    if (outline.length > 0) {
      const fill = parseColor(shape.fillColor ?? '#ffffff')
      const stroke = parseColor(shape.color ?? '#000000')
      const sw = shape.strokeWidth ?? 2
      const rng = new SeededRng(this.seed + hashStr(shape.id))

      // Hachure fill
      const hachureColor = colorWithAlpha(fill, 0.7)
      const hachureLines = generateHachure(outline, w, h, rng)
      for (const line of hachureLines) {
        const worldLine = translatePath(line, x, y)
        canvas.strokePath(worldLine, hachureColor, 1)
      }

      // Double-stroke wobbled outline
      for (let pass = 0; pass < 2; pass++) {
        const wobbled = wobblePath(outline, this.roughness, rng)
        const worldPath = translatePath(wobbled, x, y)
        canvas.strokePath(worldPath, stroke, sw)
      }
    }

    // Label
    const [lx, ly] = shape.labelPos(w, h)
    const fontSize = shape.fontSize ?? 16
    canvas.drawText(
      shape.label,
      x + lx,
      y + ly,
      fontSize,
      parseColor(shape.color ?? '#000000'),
      this.font,
    )
  }

  renderGroup(
    group: Group,
    bounds: { x: number; y: number; w: number; h: number },
    offsetX: number,
    offsetY: number,
    canvas: Canvas,
  ): void {
    const x = bounds.x + offsetX
    const y = bounds.y + offsetY
    const rng = new SeededRng(this.seed + hashStr(group.id))
    const stroke = parseColor(group.color ?? '#cccccc')

    if (group.fillColor) {
      const rect = new PathBuilder()
        .moveTo(x, y)
        .lineTo(x + bounds.w, y)
        .lineTo(x + bounds.w, y + bounds.h)
        .lineTo(x, y + bounds.h)
        .close()
        .build()
      canvas.fillPath(rect, parseColor(group.fillColor))
    }

    // Wobbled border
    const outline = new PathBuilder()
      .moveTo(0, 0)
      .lineTo(bounds.w, 0)
      .lineTo(bounds.w, bounds.h)
      .lineTo(0, bounds.h)
      .close()
      .build()

    for (let pass = 0; pass < 2; pass++) {
      const wobbled = wobblePath(outline, this.roughness * 0.5, rng)
      const worldPath = translatePath(wobbled, x, y)
      canvas.strokePath(worldPath, stroke, 1)
    }

    canvas.drawText(group.label, x + 8, y + 16, 12, parseColor(group.color ?? '#666666'), this.font)
  }

  renderConnection(
    linePath: Float64Array,
    conn: Connection,
    _from: Point,
    to: Point,
    angle: number,
    canvas: Canvas,
  ): void {
    const color = parseColor(conn.color ?? '#000000')
    const sw = conn.strokeWidth ?? 2
    const rng = new SeededRng(this.seed + hashStr(conn.id))

    for (let pass = 0; pass < 2; pass++) {
      const wobbled = wobblePath(linePath, this.roughness, rng)
      canvas.strokePath(wobbled, color, sw)
    }

    if (conn.type === 'arrow') {
      const arrow = arrowheadPath(to, angle, 10)
      canvas.strokePath(arrow, color, sw)
    }
  }

  toJSON(): unknown {
    return { name: this.name, roughness: this.roughness, seed: this.seed }
  }
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
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
  outline: Float64Array,
  w: number,
  h: number,
  rng: SeededRng,
): Float64Array[] {
  const lines: Float64Array[] = []
  const gap = 8
  const angle = -Math.PI / 4

  // Extract vertices from outline path
  const vertices: [number, number][] = []
  let i = 0
  while (i < outline.length) {
    const cmd = outline[i]
    if (cmd === MOVE_TO || cmd === LINE_TO) {
      vertices.push([outline[i + 1], outline[i + 2]])
      i += 3
    } else if (cmd === CUBIC_TO) {
      // Sample the cubic at a few points
      vertices.push([outline[i + 5], outline[i + 6]])
      i += 7
    } else {
      i += 1
    }
  }

  if (vertices.length < 3) return lines

  // Cast parallel lines at the hachure angle
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const maxDim = Math.max(w, h) * 2

  for (let d = -maxDim; d < maxDim; d += gap) {
    // Line perpendicular to angle at distance d
    const lx = cos * d, ly = sin * d
    const dx = -sin, dy = cos

    // Find intersections with polygon edges
    const intersections: number[] = []
    for (let j = 0; j < vertices.length; j++) {
      const [x1, y1] = vertices[j]
      const [x2, y2] = vertices[(j + 1) % vertices.length]

      // Line segment: P1 + t*(P2-P1), t in [0,1]
      // Hachure line: L + s*D
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

    // Draw line segments between pairs of intersections
    for (let j = 0; j + 1 < intersections.length; j += 2) {
      const s1 = intersections[j], s2 = intersections[j + 1]
      const x1 = lx + s1 * dx + rng.range(-0.5, 0.5)
      const y1 = ly + s1 * dy + rng.range(-0.5, 0.5)
      const x2 = lx + s2 * dx + rng.range(-0.5, 0.5)
      const y2 = ly + s2 * dy + rng.range(-0.5, 0.5)
      lines.push(new PathBuilder().moveTo(x1, y1).lineTo(x2, y2).build())
    }
  }

  return lines
}
