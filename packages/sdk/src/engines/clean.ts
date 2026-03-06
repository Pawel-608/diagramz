import { Engine } from './engine.js'
import type { Canvas } from './canvas.js'
import type { Shape } from '../core/shape.js'
import type { Group } from '../core/group.js'
import type { Connection } from '../core/connection.js'
import type { Point } from '../render/connections.js'
import { PathBuilder, translatePath } from '../core/path.js'
import { parseColor } from '../core/color.js'
import { arrowheadPath } from '../render/connections.js'

export class CleanEngine extends Engine {
  readonly name = 'clean'
  readonly font = 1

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
      const worldPath = translatePath(outline, x, y)
      const fill = parseColor(shape.fillColor ?? '#ffffff')
      const stroke = parseColor(shape.color ?? '#000000')
      const sw = shape.strokeWidth ?? 2

      canvas.fillPath(worldPath, fill)
      canvas.strokePath(worldPath, stroke, sw)
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

    // Background
    const fill = parseColor(group.fillColor ?? '#f5f5f5')
    const stroke = parseColor(group.color ?? '#cccccc')
    const sw = group.strokeWidth ?? 1

    const rect = new PathBuilder()
      .moveTo(x, y)
      .lineTo(x + bounds.w, y)
      .lineTo(x + bounds.w, y + bounds.h)
      .lineTo(x, y + bounds.h)
      .close()
      .build()

    canvas.fillPath(rect, fill)
    canvas.strokePath(rect, stroke, sw)

    // Group label at top
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

    if (conn.strokeDash) {
      canvas.strokePathDashed(linePath, color, sw, conn.strokeDash[0] ?? 5)
    } else {
      canvas.strokePath(linePath, color, sw)
    }

    // Arrowhead
    if (conn.type === 'arrow') {
      const arrow = arrowheadPath(to, angle, 10)
      canvas.fillPath(arrow, color)
    }
  }
}
