import { Shape, resolveSize, type ShapeOpts } from '../core/shape.js'
import { DefaultPathBuilder } from '../core/path.js'
import { parseColor } from '../core/color.js'
import type { Canvas } from '../engines/canvas.js'

const TITLE_FONT_SIZE = 14
const DETAIL_FONT_SIZE = 12
const LINE_H = 16
const CORNER_R = 10
const KAPPA = 0.5522847498

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundedRect(w: number, h: number, r: number): Float64Array {
  const k = KAPPA * r
  return new DefaultPathBuilder()
    .moveTo(r, 0)
    .lineTo(w - r, 0)
    .cubicTo(w - r + k, 0, w, r - k, w, r)
    .lineTo(w, h - r)
    .cubicTo(w, h - r + k, w - r + k, h, w - r, h)
    .lineTo(r, h)
    .cubicTo(r - k, h, 0, h - r + k, 0, h - r)
    .lineTo(0, r)
    .cubicTo(0, r - k, r - k, 0, r, 0)
    .close()
    .build()
}

function rectClip(w: number, h: number, angle: number): [number, number] {
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

/** Compute height for description lines + optional technology line. */
function bodyHeight(description: string, technology: string): number {
  let h = 20 // top padding (below title)
  if (technology) h += LINE_H
  const descLines = description ? description.split('\n') : []
  if (descLines.length > 0) h += 4 + descLines.length * LINE_H
  h += 16 // bottom padding
  return h
}

/** Estimate minimum width from all text strings. */
function minWidth(texts: string[], fontSize: number): number {
  const longest = Math.max(0, ...texts.filter(Boolean).map(s => s.length))
  return Math.max(200, longest * fontSize * 0.65 + 48)
}

// ---------------------------------------------------------------------------
// Shared opts
// ---------------------------------------------------------------------------

export interface C4ShapeOpts extends ShapeOpts {
  description?: string
  technology?: string
  external?: boolean
}

// ---------------------------------------------------------------------------
// C4 Person
// ---------------------------------------------------------------------------

export class C4PersonShape extends Shape {
  readonly type = 'c4:person'
  description: string
  external: boolean

  constructor(label: string, opts?: C4ShapeOpts) {
    super(label, opts)
    this.description = opts?.description ?? ''
    this.external = opts?.external ?? false
  }

  private get iconHeight(): number {
    return 56 // head circle + shoulders
  }

  get defaultSize(): [number, number] {
    const texts = [this.label, this.description]
    const w = minWidth(texts, DETAIL_FONT_SIZE)
    const h = this.iconHeight + TITLE_FONT_SIZE + bodyHeight(this.description, '')
    return [w, Math.max(140, h)]
  }

  outline(w: number, h: number): Float64Array {
    return roundedRect(w, h, CORNER_R)
  }

  clipPoint(w: number, h: number, angle: number): [number, number] {
    return rectClip(w, h, angle)
  }

  labelPos(w: number, _h: number): [number, number] {
    return [w / 2, this.iconHeight + 10]
  }

  override render(canvas: Canvas, offsetX: number, offsetY: number): void {
    super.render(canvas, offsetX, offsetY)
    const [w, h] = resolveSize(this)
    const x = (this.x ?? 0) + offsetX
    const y = (this.y ?? 0) + offsetY
    this.renderDetails(canvas, x, y, w, h, 0)
  }

  renderDetails(canvas: Canvas, x: number, y: number, w: number, _h: number, fontId: number): void {
    const color = parseColor(this.color ?? '#ffffff')
    const cx = x + w / 2

    // ── Person icon ──
    const headR = 12
    const headY = y + 22

    // Head
    const k = KAPPA * headR
    const head = new DefaultPathBuilder()
      .moveTo(cx + headR, headY)
      .cubicTo(cx + headR, headY + k, cx + k, headY + headR, cx, headY + headR)
      .cubicTo(cx - k, headY + headR, cx - headR, headY + k, cx - headR, headY)
      .cubicTo(cx - headR, headY - k, cx - k, headY - headR, cx, headY - headR)
      .cubicTo(cx + k, headY - headR, cx + headR, headY - k, cx + headR, headY)
      .close().build()
    canvas.fillPath(head, color)

    // Shoulders
    const bodyTop = headY + headR + 3
    const bodyW = 24
    const bodyH = 14
    const bkx = KAPPA * bodyW
    const bky = KAPPA * bodyH
    const body = new DefaultPathBuilder()
      .moveTo(cx - bodyW, bodyTop + bodyH)
      .cubicTo(cx - bodyW, bodyTop + bodyH - bky, cx - bkx, bodyTop, cx, bodyTop)
      .cubicTo(cx + bkx, bodyTop, cx + bodyW, bodyTop + bodyH - bky, cx + bodyW, bodyTop + bodyH)
      .close().build()
    canvas.fillPath(body, color)

    // ── Description ──
    if (this.description) {
      let dy = this.iconHeight + 10 + TITLE_FONT_SIZE + 8
      for (const line of this.description.split('\n')) {
        canvas.drawText(line, cx, y + dy, DETAIL_FONT_SIZE, color, fontId)
        dy += LINE_H
      }
    }

    // ── Type label ──
    const typeText = this.external ? '[External Person]' : '[Person]'
    canvas.drawText(typeText, cx, y + _h - 12, 10, color, fontId)
  }

  override toJSON(): unknown {
    const json = super.toJSON() as Record<string, unknown>
    if (this.description) json.description = this.description
    if (this.external) json.external = this.external
    return json
  }
}

// ---------------------------------------------------------------------------
// C4 Box (System / Container / Component / Database)
// ---------------------------------------------------------------------------

type C4BoxType = 'c4:system' | 'c4:container' | 'c4:component' | 'c4:database'

const TYPE_LABELS: Record<C4BoxType, string> = {
  'c4:system': 'Software System',
  'c4:container': 'Container',
  'c4:component': 'Component',
  'c4:database': 'Database',
}

export class C4BoxShape extends Shape {
  readonly type: C4BoxType
  description: string
  technology: string
  external: boolean

  constructor(type: C4BoxType, label: string, opts?: C4ShapeOpts) {
    super(label, opts)
    this.type = type
    this.description = opts?.description ?? ''
    this.technology = opts?.technology ?? ''
    this.external = opts?.external ?? false
  }

  get defaultSize(): [number, number] {
    const descLines = this.description ? this.description.split('\n') : []
    const texts = [this.label, this.technology ? `[${this.technology}]` : '', ...descLines]
    const w = minWidth(texts, DETAIL_FONT_SIZE)

    let h = 24 // top padding
    h += TITLE_FONT_SIZE
    h += bodyHeight(this.description, this.technology)
    h += LINE_H // type label

    return [w, Math.max(120, h)]
  }

  outline(w: number, h: number): Float64Array {
    return roundedRect(w, h, CORNER_R)
  }

  clipPoint(w: number, h: number, angle: number): [number, number] {
    return rectClip(w, h, angle)
  }

  labelPos(w: number, _h: number): [number, number] {
    return [w / 2, 28]
  }

  override render(canvas: Canvas, offsetX: number, offsetY: number): void {
    super.render(canvas, offsetX, offsetY)
    const [w, h] = resolveSize(this)
    const x = (this.x ?? 0) + offsetX
    const y = (this.y ?? 0) + offsetY
    this.renderDetails(canvas, x, y, w, h, 0)
  }

  renderDetails(canvas: Canvas, x: number, y: number, w: number, h: number, fontId: number): void {
    const color = parseColor(this.color ?? '#ffffff')
    const cx = x + w / 2
    let dy = 28 + TITLE_FONT_SIZE + 4

    // Technology
    if (this.technology) {
      canvas.drawText(`[${this.technology}]`, cx, y + dy, DETAIL_FONT_SIZE, color, fontId)
      dy += LINE_H
    }

    // Description
    if (this.description) {
      dy += 4
      for (const line of this.description.split('\n')) {
        canvas.drawText(line, cx, y + dy, DETAIL_FONT_SIZE, color, fontId)
        dy += LINE_H
      }
    }

    // Type label at bottom
    const baseLabel = TYPE_LABELS[this.type] ?? ''
    const typeText = this.external ? `[External ${baseLabel}]` : `[${baseLabel}]`
    canvas.drawText(typeText, cx, y + h - 12, 10, color, fontId)
  }

  override toJSON(): unknown {
    const json = super.toJSON() as Record<string, unknown>
    if (this.description) json.description = this.description
    if (this.technology) json.technology = this.technology
    if (this.external) json.external = this.external
    return json
  }
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function c4Person(label: string, opts?: C4ShapeOpts): C4PersonShape {
  return new C4PersonShape(label, opts)
}

export function c4System(label: string, opts?: C4ShapeOpts): C4BoxShape {
  return new C4BoxShape('c4:system', label, opts)
}

export function c4ExternalSystem(label: string, opts?: C4ShapeOpts): C4BoxShape {
  return new C4BoxShape('c4:system', label, { ...opts, external: true })
}

export function c4Container(label: string, opts?: C4ShapeOpts): C4BoxShape {
  return new C4BoxShape('c4:container', label, opts)
}

export function c4ExternalContainer(label: string, opts?: C4ShapeOpts): C4BoxShape {
  return new C4BoxShape('c4:container', label, { ...opts, external: true })
}

export function c4Component(label: string, opts?: C4ShapeOpts): C4BoxShape {
  return new C4BoxShape('c4:component', label, opts)
}

export function c4Database(label: string, opts?: C4ShapeOpts): C4BoxShape {
  return new C4BoxShape('c4:database', label, opts)
}
