import { Shape, resolveSize } from '../core/shape.js'
import { Group } from '../core/group.js'
import type { Node } from '../core/node.js'
import type { Connection } from '../core/connection.js'
import { DefaultPathBuilder } from '../core/path.js'

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
  const spread = 0.35 // ~20 degrees — sleek chevron
  const a1 = angle + Math.PI - spread
  const a2 = angle + Math.PI + spread
  return new DefaultPathBuilder()
    .moveTo(tip.x + size * Math.cos(a1), tip.y + size * Math.sin(a1))
    .lineTo(tip.x, tip.y)
    .lineTo(tip.x + size * Math.cos(a2), tip.y + size * Math.sin(a2))
    .build()
}

/** Closed triangle for inheritance/implementation */
export function triangleHeadPath(tip: Point, angle: number, size: number = 12): Float64Array {
  const spread = 0.4
  const a1 = angle + Math.PI - spread
  const a2 = angle + Math.PI + spread
  return new DefaultPathBuilder()
    .moveTo(tip.x, tip.y)
    .lineTo(tip.x + size * Math.cos(a1), tip.y + size * Math.sin(a1))
    .lineTo(tip.x + size * Math.cos(a2), tip.y + size * Math.sin(a2))
    .close()
    .build()
}

/** Diamond for composition/aggregation at source end */
export function diamondDecorPath(point: Point, angle: number, size: number = 10): Float64Array {
  const dx = Math.cos(angle), dy = Math.sin(angle)
  const px = -dy, py = dx
  const hw = size * 0.45
  return new DefaultPathBuilder()
    .moveTo(point.x, point.y)
    .lineTo(point.x + dx * size + px * hw, point.y + dy * size + py * hw)
    .lineTo(point.x + dx * size * 2, point.y + dy * size * 2)
    .lineTo(point.x + dx * size - px * hw, point.y + dy * size - py * hw)
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
  const dx = toCenter.x - fromCenter.x
  const dy = toCenter.y - fromCenter.y
  // Bias clip angle toward vertical so edges prefer top/bottom exits
  const clipAngle = Math.atan2(dy, dx * 0.3)
  const fromPt = clipToNode(from, clipAngle, offset)
  const toPt = clipToNode(to, clipAngle + Math.PI, offset)
  // Use the actual line angle for arrowhead direction
  const angle = Math.atan2(toPt.y - fromPt.y, toPt.x - fromPt.x)
  return { from: fromPt, to: toPt, angle }
}

export function labelPosition(from: Point, to: Point): Point {
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2 - 8,
  }
}

type Side = 'top' | 'bottom' | 'left' | 'right'

/** port: 0–1 fractional position along the side (0.5 = center) */
function nodeSidePoint(node: Node, side: Side, offset: Point, port: number = 0.5): Point {
  if (node instanceof Shape) {
    const [w, h] = resolveSize(node)
    const x = (node.x ?? 0) + offset.x
    const y = (node.y ?? 0) + offset.y
    switch (side) {
      case 'top': return { x: x + w * port, y }
      case 'bottom': return { x: x + w * port, y: y + h }
      case 'left': return { x, y: y + h * port }
      case 'right': return { x: x + w, y: y + h * port }
    }
  }
  if (node instanceof Group) {
    const b = node.bounds()
    if (b) {
      const x = b.x + offset.x
      const y = b.y + offset.y
      switch (side) {
        case 'top': return { x: x + b.w * port, y }
        case 'bottom': return { x: x + b.w * port, y: y + b.h }
        case 'left': return { x, y: y + b.h * port }
        case 'right': return { x: x + b.w, y: y + b.h * port }
      }
    }
  }
  return { x: offset.x, y: offset.y }
}

const SIDE_ANGLES: Record<Side, number> = {
  bottom: Math.PI / 2,
  top: -Math.PI / 2,
  right: 0,
  left: Math.PI,
}

export interface OrthogonalRoute {
  from: Point
  to: Point
  path: Float64Array
  angle: number
  midPoint: Point
}

export function determineSides(from: Node, to: Node): { fromSide: Side; toSide: Side } {
  const fromCenter = nodeCenter(from)
  const toCenter = nodeCenter(to)
  const dx = toCenter.x - fromCenter.x
  const dy = toCenter.y - fromCenter.y
  if (Math.abs(dy) >= 20) {
    return dy > 0
      ? { fromSide: 'bottom', toSide: 'top' }
      : { fromSide: 'top', toSide: 'bottom' }
  }
  return dx > 0
    ? { fromSide: 'right', toSide: 'left' }
    : { fromSide: 'left', toSide: 'right' }
}

export function orthogonalRoute(
  from: Node,
  to: Node,
  offset: Point,
  waypoints: { x: number; y: number }[],
  fromPort: number = 0.5,
  toPort: number = 0.5,
): OrthogonalRoute {
  const { fromSide, toSide } = determineSides(from, to)

  const fromPt = nodeSidePoint(from, fromSide, offset, fromPort)
  const toPt = nodeSidePoint(to, toSide, offset, toPort)

  // Build list of all points to route through
  const points: Point[] = [fromPt]
  for (const wp of waypoints) {
    points.push({ x: wp.x + offset.x, y: wp.y + offset.y })
  }
  points.push(toPt)

  const pb = new DefaultPathBuilder().moveTo(fromPt.x, fromPt.y)
  const isVertical = fromSide === 'top' || fromSide === 'bottom'

  // Simple S-bend between source and target — clean orthogonal routing
  if (Math.abs(fromPt.x - toPt.x) < 0.5) {
    pb.lineTo(toPt.x, toPt.y)
  } else if (Math.abs(fromPt.y - toPt.y) < 0.5) {
    pb.lineTo(toPt.x, toPt.y)
  } else if (isVertical) {
    const midY = (fromPt.y + toPt.y) / 2
    pb.lineTo(fromPt.x, midY)
    pb.lineTo(toPt.x, midY)
    pb.lineTo(toPt.x, toPt.y)
  } else {
    const midX = (fromPt.x + toPt.x) / 2
    pb.lineTo(midX, fromPt.y)
    pb.lineTo(midX, toPt.y)
    pb.lineTo(toPt.x, toPt.y)
  }

  const angle = SIDE_ANGLES[toSide]

  // Midpoint for label placement
  const midPoint = {
    x: (fromPt.x + toPt.x) / 2,
    y: (fromPt.y + toPt.y) / 2 - 8,
  }

  return { from: fromPt, to: toPt, path: pb.build(), angle, midPoint }
}

/**
 * Assign spread port positions so connections sharing a node side
 * don't all exit/enter at the exact same point.
 * Sorts by the other end's position to minimise crossings.
 */
export function assignConnectionPorts(connections: Connection[]): void {
  // Group connections by (nodeId, side) for both ends
  interface Entry { conn: Connection; role: 'from' | 'to'; otherCenter: Point }
  const groups = new Map<string, Entry[]>()

  for (const conn of connections) {
    const { fromSide, toSide } = determineSides(conn.from, conn.target)
    const fromKey = `${conn.from.id}:${fromSide}`
    const toKey = `${conn.target.id}:${toSide}`

    if (!groups.has(fromKey)) groups.set(fromKey, [])
    groups.get(fromKey)!.push({ conn, role: 'from', otherCenter: nodeCenter(conn.target) })

    if (!groups.has(toKey)) groups.set(toKey, [])
    groups.get(toKey)!.push({ conn, role: 'to', otherCenter: nodeCenter(conn.from) })
  }

  // Reset all ports to center
  for (const conn of connections) {
    conn.fromPort = 0.5
    conn.toPort = 0.5
  }

  for (const [key, entries] of groups) {
    if (entries.length <= 1) continue

    const side = key.split(':').pop() as Side
    const isHorizontalSide = side === 'top' || side === 'bottom'

    // Sort by the other end's position to minimise crossings
    // For top/bottom sides: sort by other node's X
    // For left/right sides: sort by other node's Y
    entries.sort((a, b) =>
      isHorizontalSide
        ? a.otherCenter.x - b.otherCenter.x
        : a.otherCenter.y - b.otherCenter.y
    )

    const n = entries.length
    const pad = 0.15 // 15% margin from edges
    for (let i = 0; i < n; i++) {
      const port = pad + (1 - 2 * pad) * i / (n - 1)
      const { conn, role } = entries[i]
      if (role === 'from') conn.fromPort = port
      else conn.toPort = port
    }
  }
}
