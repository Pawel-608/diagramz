import { Shape, resolveSize } from '../core/shape.js'
import { Group } from '../core/group.js'
import type { Node } from '../core/node.js'
import { PathBuilder } from '../core/path.js'

export interface Point {
  x: number
  y: number
}

export function nodeCenter(node: Node): Point {
  if (node instanceof Shape) {
    const [w, h] = resolveSize(node)
    return { x: (node.x ?? 0) + w / 2, y: (node.y ?? 0) + h / 2 }
  }
  if (node instanceof Group) {
    const b = node.bounds()
    if (b) return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  }
  return { x: 0, y: 0 }
}

export function clipToNode(
  node: Node,
  angle: number,
  offset: Point,
): Point {
  if (node instanceof Shape) {
    const [w, h] = resolveSize(node)
    const [cx, cy] = node.clipPoint(w, h, angle)
    return { x: (node.x ?? 0) + cx + offset.x, y: (node.y ?? 0) + cy + offset.y }
  }
  if (node instanceof Group) {
    const b = node.bounds()
    if (b) {
      // Clip to group bounding rect
      const gw = b.w, gh = b.h
      const gcx = gw / 2, gcy = gh / 2
      const cos = Math.cos(angle), sin = Math.sin(angle)

      if (cos > 1e-9) {
        const t = (gw - gcx) / cos
        const y = gcy + t * sin
        if (y >= 0 && y <= gh) return { x: b.x + gw + offset.x, y: b.y + y + offset.y }
      }
      if (cos < -1e-9) {
        const t = -gcx / cos
        const y = gcy + t * sin
        if (y >= 0 && y <= gh) return { x: b.x + offset.x, y: b.y + y + offset.y }
      }
      if (sin > 1e-9) {
        const t = (gh - gcy) / sin
        const x = gcx + t * cos
        if (x >= 0 && x <= gw) return { x: b.x + x + offset.x, y: b.y + gh + offset.y }
      }
      if (sin < -1e-9) {
        const t = -gcy / sin
        const x = gcx + t * cos
        if (x >= 0 && x <= gw) return { x: b.x + x + offset.x, y: b.y + offset.y }
      }
      return { x: b.x + gcx + offset.x, y: b.y + gcy + offset.y }
    }
  }
  return { x: offset.x, y: offset.y }
}

export function arrowheadPath(tip: Point, angle: number, size: number = 10): Float64Array {
  const a1 = angle + Math.PI * 0.85
  const a2 = angle - Math.PI * 0.85
  return new PathBuilder()
    .moveTo(tip.x, tip.y)
    .lineTo(tip.x + size * Math.cos(a1), tip.y + size * Math.sin(a1))
    .lineTo(tip.x + size * Math.cos(a2), tip.y + size * Math.sin(a2))
    .close()
    .build()
}

export function connectionEndpoints(
  from: Node,
  to: Node,
  offset: Point,
): { from: Point; to: Point; angle: number } {
  const fromCenter = nodeCenter(from)
  const toCenter = nodeCenter(to)
  const angle = Math.atan2(
    toCenter.y - fromCenter.y,
    toCenter.x - fromCenter.x,
  )
  const fromPt = clipToNode(from, angle, offset)
  const toPt = clipToNode(to, angle + Math.PI, offset)
  return { from: fromPt, to: toPt, angle }
}

export function labelPosition(from: Point, to: Point): Point {
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2 - 8,
  }
}
