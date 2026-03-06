import type { Diagram } from '../core/diagram.js'
import type { Canvas, CanvasFactory } from '../engines/canvas.js'
import type { Engine } from '../engines/engine.js'
import { Shape, resolveSize } from '../core/shape.js'
import { Group } from '../core/group.js'
import { PathBuilder, translatePath } from '../core/path.js'
import { parseColor } from '../core/color.js'
import { connectionEndpoints, arrowheadPath, labelPosition, nodeCenter, clipToNode, type Point } from './connections.js'

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function collectAllShapes(children: (Shape | Group)[]): Shape[] {
  const result: Shape[] = []
  for (const child of children) {
    if (child instanceof Group) {
      result.push(...collectAllShapes(child.children))
    } else {
      result.push(child)
    }
  }
  return result
}

function collectAllGroups(children: (Shape | Group)[]): Group[] {
  const result: Group[] = []
  for (const child of children) {
    if (child instanceof Group) {
      result.push(child)
      result.push(...collectAllGroups(child.children))
    }
  }
  return result
}

function computeBounds(shapes: Shape[], groups: Group[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (const s of shapes) {
    const [w, h] = resolveSize(s)
    const x = s.x ?? 0
    const y = s.y ?? 0
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
  }

  for (const g of groups) {
    const b = g.bounds()
    if (b) {
      minX = Math.min(minX, b.x)
      minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.w)
      maxY = Math.max(maxY, b.y + b.h)
    }
  }

  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 200, maxY: 200 }
  return { minX, minY, maxX, maxY }
}

function scalePath(segs: Float64Array, s: number): Float64Array {
  if (s === 1) return segs
  const out = new Float64Array(segs.length)
  let i = 0
  while (i < segs.length) {
    const cmd = segs[i]
    out[i] = cmd
    if (cmd === 0 || cmd === 1) { // MoveTo / LineTo
      out[i + 1] = segs[i + 1] * s
      out[i + 2] = segs[i + 2] * s
      i += 3
    } else if (cmd === 2) { // CubicTo
      out[i + 1] = segs[i + 1] * s
      out[i + 2] = segs[i + 2] * s
      out[i + 3] = segs[i + 3] * s
      out[i + 4] = segs[i + 4] * s
      out[i + 5] = segs[i + 5] * s
      out[i + 6] = segs[i + 6] * s
      i += 7
    } else { // Close
      i += 1
    }
  }
  return out
}

class ScaledCanvas implements Canvas {
  constructor(private inner: Canvas, private s: number) {}

  fillPath(segs: Float64Array, color: number): void {
    this.inner.fillPath(scalePath(segs, this.s), color)
  }
  strokePath(segs: Float64Array, color: number, width: number): void {
    this.inner.strokePath(scalePath(segs, this.s), color, width * this.s)
  }
  strokePathDashed(segs: Float64Array, color: number, width: number, dash: number): void {
    this.inner.strokePathDashed(scalePath(segs, this.s), color, width * this.s, dash * this.s)
  }
  drawText(text: string, x: number, y: number, size: number, color: number, font: number): void {
    this.inner.drawText(text, x * this.s, y * this.s, size * this.s, color, font)
  }
  measureText(text: string, size: number, font: number): [number, number] {
    return this.inner.measureText(text, size, font)
  }
  toPng(): Uint8Array {
    return this.inner.toPng()
  }
  toImageData(): Uint8Array {
    return this.inner.toImageData()
  }
}

export interface RenderOpts {
  scale?: number
  skipLayout?: boolean
}

export interface RenderResult {
  canvas: Canvas
  offsetX: number
  offsetY: number
  width: number
  height: number
}

function renderInternal(
  diagram: Diagram,
  engine: Engine,
  factory: CanvasFactory,
  opts?: RenderOpts,
): RenderResult {
  const scale = opts?.scale ?? 2

  if (!opts?.skipLayout) {
    diagram.layout.apply(diagram)
  }

  const shapes = collectAllShapes(diagram.children)
  const groups = collectAllGroups(diagram.children)

  const bounds = computeBounds(shapes, groups)
  const padding = 40
  const width = Math.ceil(bounds.maxX - bounds.minX + padding * 2)
  const height = Math.ceil(bounds.maxY - bounds.minY + padding * 2)

  const rawCanvas = factory.create(Math.max(width * scale, 1), Math.max(height * scale, 1))
  const canvas: Canvas = scale === 1 ? rawCanvas : new ScaledCanvas(rawCanvas, scale)

  const offsetX = -bounds.minX + padding
  const offsetY = -bounds.minY + padding

  // Render groups (deepest first)
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    const b = g.bounds()
    if (!b) continue
    engine.renderGroup(g, b, offsetX, offsetY, canvas)
  }

  // Render shapes
  for (const shape of shapes) {
    const [w, h] = resolveSize(shape)
    engine.renderElement(shape, w, h, offsetX, offsetY, canvas)
  }

  // Render connections
  const offset = { x: offsetX, y: offsetY }
  for (const conn of diagram.connections) {
    const waypoints = conn.waypoints ?? []
    let fromPt: Point, toPt: Point, linePath: Float64Array, angle: number

    if (waypoints.length > 0) {
      const fromCenter = nodeCenter(conn.from)
      const toCenter = nodeCenter(conn.target)

      const fdx = waypoints[0].x - fromCenter.x
      const fdy = waypoints[0].y - fromCenter.y
      const fromAngle = Math.atan2(fdy, fdx * 0.3)
      fromPt = clipToNode(conn.from, fromAngle, offset)

      const lastWp = waypoints[waypoints.length - 1]
      const tdx = lastWp.x - toCenter.x
      const tdy = lastWp.y - toCenter.y
      const toAngle = Math.atan2(tdy, tdx * 0.3)
      toPt = clipToNode(conn.target, toAngle, offset)

      const pb = new PathBuilder().moveTo(fromPt.x, fromPt.y)
      for (const wp of waypoints) {
        pb.lineTo(wp.x + offset.x, wp.y + offset.y)
      }
      pb.lineTo(toPt.x, toPt.y)
      linePath = pb.build()

      angle = Math.atan2(toPt.y - (lastWp.y + offset.y), toPt.x - (lastWp.x + offset.x))
    } else {
      const result = connectionEndpoints(conn.from, conn.target, offset)
      fromPt = result.from
      toPt = result.to
      angle = result.angle
      linePath = new PathBuilder()
        .moveTo(fromPt.x, fromPt.y)
        .lineTo(toPt.x, toPt.y)
        .build()
    }

    engine.renderConnection(linePath, conn, fromPt, toPt, angle, canvas)

    if (conn.label) {
      let labelPt: Point
      if (waypoints.length > 0) {
        const midIdx = Math.floor(waypoints.length / 2)
        labelPt = { x: waypoints[midIdx].x + offset.x, y: waypoints[midIdx].y + offset.y - 8 }
      } else {
        labelPt = labelPosition(fromPt, toPt)
      }
      const [tw] = canvas.measureText(conn.label, 12, engine.font)
      const pad = 3
      const bgRect = new PathBuilder()
        .moveTo(labelPt.x - tw / 2 - pad, labelPt.y - 8 - pad)
        .lineTo(labelPt.x + tw / 2 + pad, labelPt.y - 8 - pad)
        .lineTo(labelPt.x + tw / 2 + pad, labelPt.y + 4 + pad)
        .lineTo(labelPt.x - tw / 2 - pad, labelPt.y + 4 + pad)
        .close().build()
      canvas.fillPath(bgRect, 0xf8f8f8e0)
      canvas.drawText(conn.label, labelPt.x, labelPt.y, 12, parseColor(conn.color ?? '#000000'), engine.font)
    }
  }

  return { canvas: rawCanvas, offsetX, offsetY, width, height }
}

export function renderDiagram(
  diagram: Diagram,
  engine: Engine,
  factory: CanvasFactory,
  opts?: RenderOpts,
): Uint8Array {
  return renderInternal(diagram, engine, factory, opts).canvas.toPng()
}

export function renderDiagramToCanvas(
  diagram: Diagram,
  engine: Engine,
  factory: CanvasFactory,
  opts?: RenderOpts,
): RenderResult {
  return renderInternal(diagram, engine, factory, opts)
}
