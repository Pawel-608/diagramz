import type { Diagram } from '../core/diagram.js'
import type { Canvas, RenderTarget, RenderTargetFactory } from '../engines/canvas.js'
import { SvgTarget, svgTargetFactory } from '../engines/svg-canvas.js'
import { assignConnectionPorts } from '../render/connections.js'
import { Shape, resolveSize } from '../core/shape.js'
import { Group } from '../core/group.js'
import { DefaultPathBuilder } from '../core/path.js'
import { parseColor } from '../core/color.js'
import { applyPalette } from '../themes/index.js'

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
  fillAndStrokePath(segs: Float64Array, fillColor: number, strokeColor: number, strokeWidth: number): void {
    this.inner.fillAndStrokePath(scalePath(segs, this.s), fillColor, strokeColor, strokeWidth * this.s)
  }
  drawText(text: string, x: number, y: number, size: number, color: number, font: number): void {
    this.inner.drawText(text, x * this.s, y * this.s, size * this.s, color, font)
  }
  measureText(text: string, size: number, font: number): [number, number] {
    return this.inner.measureText(text, size, font)
  }
}

export interface RenderOpts {
  scale?: number
  skipLayout?: boolean
}

export interface RenderResult {
  target: RenderTarget
  canvas: Canvas
  offsetX: number
  offsetY: number
  width: number
  height: number
}

export type CanvasWrapper = (target: RenderTarget) => Canvas

function renderInternal(
  diagram: Diagram,
  wrapCanvas: CanvasWrapper,
  factory: RenderTargetFactory,
  opts?: RenderOpts,
): RenderResult {
  const scale = opts?.scale ?? 2

  if (!opts?.skipLayout) {
    diagram.layout.apply(diagram)
  }

  const shapes = collectAllShapes(diagram.children)
  const groups = collectAllGroups(diagram.children)

  // Apply palette defaults to shapes/groups that lack explicit colors
  if (diagram.colors && diagram.colors.length > 0) {
    applyPalette(shapes, groups, diagram.colors)
  }

  const bounds = computeBounds(shapes, groups)
  const padding = 40

  // Reserve space for description legend below diagram
  const descLines = diagram.description ? diagram.description.split('\n') : []
  const descFontSize = 13
  const descLineHeight = 18
  const descPaddingTop = descLines.length > 0 ? 24 : 0
  const descHeight = descLines.length > 0 ? descPaddingTop + descLines.length * descLineHeight + 8 : 0

  const width = Math.ceil(bounds.maxX - bounds.minX + padding * 2)
  const height = Math.ceil(bounds.maxY - bounds.minY + padding * 2 + descHeight)

  const target = factory.create(Math.max(width * scale, 1), Math.max(height * scale, 1))
  const styledCanvas = wrapCanvas(target)
  const canvas: Canvas = scale === 1 ? styledCanvas : new ScaledCanvas(styledCanvas, scale)

  // Fill background if specified
  if (diagram.background) {
    const bgRect = new DefaultPathBuilder()
      .moveTo(0, 0)
      .lineTo(width, 0)
      .lineTo(width, height)
      .lineTo(0, height)
      .close()
      .build()
    canvas.fillPath(bgRect, parseColor(diagram.background))
  }

  const offsetX = -bounds.minX + padding
  const offsetY = -bounds.minY + padding

  // Render groups (deepest first) — groups render themselves
  for (let i = groups.length - 1; i >= 0; i--) {
    groups[i].render(canvas, offsetX, offsetY)
  }

  // Assign spread port positions so connections don't overlap
  assignConnectionPorts(diagram.connections)

  // Render connections BEFORE shapes so they appear behind nodes
  const offset = { x: offsetX, y: offsetY }
  for (const conn of diagram.connections) {
    conn.render(canvas, offset)
  }

  // Render shapes — shapes render themselves (on top of connections)
  for (const shape of shapes) {
    shape.render(canvas, offsetX, offsetY)
  }

  // Render description legend below diagram
  if (descLines.length > 0) {
    const descY = bounds.maxY - bounds.minY + padding * 2 + descPaddingTop
    const descColor = parseColor('#666666')
    for (let i = 0; i < descLines.length; i++) {
      const line = descLines[i]
      const [tw] = canvas.measureText(line, descFontSize, 0)
      const lx = (width - tw) / 2
      canvas.drawText(line, lx, descY + i * descLineHeight, descFontSize, descColor, 0)
    }
  }

  return { target, canvas, offsetX, offsetY, width, height }
}

export function renderDiagram(
  diagram: Diagram,
  wrapCanvas: CanvasWrapper,
  factory: RenderTargetFactory,
  opts?: RenderOpts,
): Uint8Array {
  return renderInternal(diagram, wrapCanvas, factory, opts).target.toPng()
}

export function renderDiagramToCanvas(
  diagram: Diagram,
  wrapCanvas: CanvasWrapper,
  factory: RenderTargetFactory,
  opts?: RenderOpts,
): RenderResult {
  return renderInternal(diagram, wrapCanvas, factory, opts)
}

export function renderToSvg(
  diagram: Diagram,
  wrapCanvas: CanvasWrapper,
  opts?: Omit<RenderOpts, 'scale'>,
): string {
  const result = renderInternal(diagram, wrapCanvas, svgTargetFactory, { ...opts, scale: 1 })
  return (result.target as SvgTarget).toSvg()
}
