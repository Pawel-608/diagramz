import { Shape, resolveSize, type ShapeOpts } from '../core/shape.js'
import { DefaultPathBuilder } from '../core/path.js'
import { parseColor } from '../core/color.js'
import type { Canvas } from '../engines/canvas.js'

const MEMBER_FONT_SIZE = 12
const MEMBER_LINE_H = 18
const SECTION_PAD = 6

export type Visibility = '+' | '-' | '#' | '~'

export interface Field {
  name: string
  type?: string
  visibility?: Visibility
}

export interface Method {
  name: string
  params?: string
  returns?: string
  visibility?: Visibility
}

function formatField(f: Field): string {
  const vis = f.visibility ?? '+'
  return f.type ? `${vis}${f.name}: ${f.type}` : `${vis}${f.name}`
}

function formatMethod(m: Method): string {
  const vis = m.visibility ?? '+'
  const params = m.params ?? ''
  const ret = m.returns ? `: ${m.returns}` : ''
  return `${vis}${m.name}(${params})${ret}`
}

export interface ClassShapeOpts extends ShapeOpts {
  stereotype?: string
  fields?: Field[]
  methods?: Method[]
}

export class ClassShape extends Shape {
  readonly type = 'class'
  stereotype?: string
  rawFields: Field[]
  rawMethods: Method[]

  constructor(label: string, opts?: ClassShapeOpts) {
    super(label, opts)
    this.stereotype = opts?.stereotype
    this.rawFields = opts?.fields ?? []
    this.rawMethods = opts?.methods ?? []
  }

  get fields(): string[] {
    return this.rawFields.map(formatField)
  }

  get methods(): string[] {
    return this.rawMethods.map(formatMethod)
  }

  private get headerHeight(): number {
    return this.stereotype ? 44 : 30
  }

  private get fieldSectionHeight(): number {
    return this.rawFields.length > 0 ? this.rawFields.length * MEMBER_LINE_H + SECTION_PAD : SECTION_PAD
  }

  private get methodSectionHeight(): number {
    return this.rawMethods.length > 0 ? this.rawMethods.length * MEMBER_LINE_H + SECTION_PAD : SECTION_PAD
  }

  get defaultSize(): [number, number] {
    const allStrings = [this.label, ...(this.stereotype ? [`<<${this.stereotype}>>`] : []), ...this.fields, ...this.methods]
    const longestLen = Math.max(0, ...allStrings.map(s => s.length))
    const w = Math.max(160, longestLen * MEMBER_FONT_SIZE * 0.65 + 32)
    const h = this.headerHeight + this.fieldSectionHeight + this.methodSectionHeight
    return [w, h]
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
    const hh = this.headerHeight
    if (this.stereotype) {
      return [w / 2, hh / 2 + 8]
    }
    return [w / 2, hh / 2]
  }

  override render(canvas: Canvas, offsetX: number, offsetY: number): void {
    super.render(canvas, offsetX, offsetY)
    const [w, h] = resolveSize(this)
    const x = (this.x ?? 0) + offsetX
    const y = (this.y ?? 0) + offsetY
    this.renderDetails(canvas, x, y, w, h, 0)
  }

  renderDetails(canvas: Canvas, x: number, y: number, w: number, h: number, fontId: number): void {
    const color = parseColor(this.color ?? '#000000')
    const hh = this.headerHeight
    const leftPad = 8

    if (this.stereotype) {
      const stereoText = `\u00AB${this.stereotype}\u00BB`
      canvas.drawText(stereoText, x + w / 2, y + hh / 2 - 8, MEMBER_FONT_SIZE, color, fontId)
    }

    const div1Y = y + hh
    canvas.strokePath(
      new DefaultPathBuilder().moveTo(x, div1Y).lineTo(x + w, div1Y).build(),
      color, 1,
    )

    const fields = this.fields
    let memberY = div1Y + SECTION_PAD / 2
    for (const field of fields) {
      const [tw] = canvas.measureText(field, MEMBER_FONT_SIZE, fontId)
      memberY += MEMBER_LINE_H / 2
      canvas.drawText(field, x + leftPad + tw / 2, memberY, MEMBER_FONT_SIZE, color, fontId)
      memberY += MEMBER_LINE_H / 2
    }

    const div2Y = y + hh + this.fieldSectionHeight
    canvas.strokePath(
      new DefaultPathBuilder().moveTo(x, div2Y).lineTo(x + w, div2Y).build(),
      color, 1,
    )

    const methods = this.methods
    memberY = div2Y + SECTION_PAD / 2
    for (const method of methods) {
      const [tw] = canvas.measureText(method, MEMBER_FONT_SIZE, fontId)
      memberY += MEMBER_LINE_H / 2
      canvas.drawText(method, x + leftPad + tw / 2, memberY, MEMBER_FONT_SIZE, color, fontId)
      memberY += MEMBER_LINE_H / 2
    }
  }

  override toJSON(): unknown {
    const json = super.toJSON() as Record<string, unknown>
    if (this.stereotype) json.stereotype = this.stereotype
    if (this.rawFields.length > 0) json.fields = this.rawFields
    if (this.rawMethods.length > 0) json.methods = this.rawMethods
    return json
  }
}

export function classShape(label: string, opts?: ClassShapeOpts): ClassShape {
  return new ClassShape(label, opts)
}
