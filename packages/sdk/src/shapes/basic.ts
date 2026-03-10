import { Shape, type ShapeOpts } from '../core/shape.js'
import { DefaultPathBuilder } from '../core/path.js'

const KAPPA = 0.5522847498

class RectangleShape extends Shape {
  readonly type = 'rectangle'

  get defaultSize(): [number, number] {
    return [120, 60]
  }

  outline(w: number, h: number): Float64Array {
    return new DefaultPathBuilder()
      .moveTo(0, 0).lineTo(w, 0).lineTo(w, h).lineTo(0, h)
      .close().build()
  }

  clipPoint(w: number, h: number, angle: number): [number, number] {
    const cx = w / 2, cy = h / 2
    const cos = Math.cos(angle), sin = Math.sin(angle)

    if (cos > 1e-9) {
      const t = (w - cx) / cos
      const y = cy + t * sin
      if (y >= 0 && y <= h) return [w, y]
    }
    if (cos < -1e-9) {
      const t = -cx / cos
      const y = cy + t * sin
      if (y >= 0 && y <= h) return [0, y]
    }
    if (sin > 1e-9) {
      const t = (h - cy) / sin
      const x = cx + t * cos
      if (x >= 0 && x <= w) return [x, h]
    }
    if (sin < -1e-9) {
      const t = -cy / sin
      const x = cx + t * cos
      if (x >= 0 && x <= w) return [x, 0]
    }
    return [cx, cy]
  }

  labelPos(w: number, h: number): [number, number] {
    return [w / 2, h / 2]
  }
}

class EllipseShape extends Shape {
  readonly type = 'ellipse'

  get defaultSize(): [number, number] {
    return [120, 80]
  }

  outline(w: number, h: number): Float64Array {
    const rx = w / 2, ry = h / 2
    const cx = rx, cy = ry
    const kx = KAPPA * rx, ky = KAPPA * ry
    return new DefaultPathBuilder()
      .moveTo(cx + rx, cy)
      .cubicTo(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry)
      .cubicTo(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy)
      .cubicTo(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry)
      .cubicTo(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy)
      .close().build()
  }

  clipPoint(w: number, h: number, angle: number): [number, number] {
    const rx = w / 2, ry = h / 2
    return [rx + rx * Math.cos(angle), ry + ry * Math.sin(angle)]
  }

  labelPos(w: number, h: number): [number, number] {
    return [w / 2, h / 2]
  }
}

class DiamondShape extends Shape {
  readonly type = 'diamond'

  get defaultSize(): [number, number] {
    return [120, 80]
  }

  outline(w: number, h: number): Float64Array {
    return new DefaultPathBuilder()
      .moveTo(w / 2, 0).lineTo(w, h / 2).lineTo(w / 2, h).lineTo(0, h / 2)
      .close().build()
  }

  clipPoint(w: number, h: number, angle: number): [number, number] {
    const cx = w / 2, cy = h / 2
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const t = 1 / (Math.abs(cos) / cx + Math.abs(sin) / cy)
    return [cx + t * cos, cy + t * sin]
  }

  labelPos(w: number, h: number): [number, number] {
    return [w / 2, h / 2]
  }
}

class TextShape extends Shape {
  readonly type = 'text'

  get defaultSize(): [number, number] {
    return [80, 30]
  }

  outline(_w: number, _h: number): Float64Array {
    return new Float64Array(0)
  }

  clipPoint(w: number, h: number, angle: number): [number, number] {
    // Clip against a larger virtual box so arrows stop well outside the text
    const pad = 14
    const pw = w + pad * 2, ph = h + pad * 2
    const cx = pw / 2, cy = ph / 2
    const cos = Math.cos(angle), sin = Math.sin(angle)

    let rx = cx, ry = cy
    if (cos > 1e-9) {
      const t = (pw - cx) / cos
      const y = cy + t * sin
      if (y >= 0 && y <= ph) { rx = pw; ry = y }
    }
    if (cos < -1e-9) {
      const t = -cx / cos
      const y = cy + t * sin
      if (y >= 0 && y <= ph) { rx = 0; ry = y }
    }
    if (sin > 1e-9 && rx === cx) {
      const t = (ph - cy) / sin
      const x = cx + t * cos
      if (x >= 0 && x <= pw) { rx = x; ry = ph }
    }
    if (sin < -1e-9 && rx === cx) {
      const t = -cy / sin
      const x = cx + t * cos
      if (x >= 0 && x <= pw) { rx = x; ry = 0 }
    }
    return [rx - pad, ry - pad]
  }

  labelPos(w: number, h: number): [number, number] {
    return [w / 2, h / 2]
  }
}

export function rectangle(label: string, opts?: ShapeOpts): Shape {
  return new RectangleShape(label, opts)
}

export function ellipse(label: string, opts?: ShapeOpts): Shape {
  return new EllipseShape(label, opts)
}

export function diamond(label: string, opts?: ShapeOpts): Shape {
  return new DiamondShape(label, opts)
}

export function text(label: string, opts?: ShapeOpts): Shape {
  return new TextShape(label, opts)
}
