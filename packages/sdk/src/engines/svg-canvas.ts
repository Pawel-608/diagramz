import type { Canvas, CanvasFactory } from './canvas.js'

const FONTS = [
  '"Architects Daughter", cursive',  // font 0 = sketchy
  '"Nunito", sans-serif',             // font 1 = clean
]

function colorToCSS(c: number): string {
  const r = (c >>> 24) & 0xff
  const g = (c >>> 16) & 0xff
  const b = (c >>> 8) & 0xff
  const a = (c & 0xff) / 255
  if (a === 1) return `rgb(${r},${g},${b})`
  return `rgba(${r},${g},${b},${a.toFixed(3)})`
}

function segsToSvgPath(segs: Float64Array): string {
  const parts: string[] = []
  let i = 0
  while (i < segs.length) {
    const cmd = segs[i]
    if (cmd === 0) { // MoveTo
      parts.push(`M${segs[i + 1].toFixed(2)},${segs[i + 2].toFixed(2)}`)
      i += 3
    } else if (cmd === 1) { // LineTo
      parts.push(`L${segs[i + 1].toFixed(2)},${segs[i + 2].toFixed(2)}`)
      i += 3
    } else if (cmd === 2) { // CubicTo
      parts.push(`C${segs[i + 1].toFixed(2)},${segs[i + 2].toFixed(2)} ${segs[i + 3].toFixed(2)},${segs[i + 4].toFixed(2)} ${segs[i + 5].toFixed(2)},${segs[i + 6].toFixed(2)}`)
      i += 7
    } else if (cmd === 3) { // Close
      parts.push('Z')
      i += 1
    } else {
      i += 1
    }
  }
  return parts.join('')
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export class SvgCanvas implements Canvas {
  private elements: string[] = []
  private w: number
  private h: number

  constructor(width: number, height: number) {
    this.w = width
    this.h = height
    // white background
    this.elements.push(`<rect width="${width}" height="${height}" fill="#fff"/>`)
  }

  fillPath(segs: Float64Array, color: number): void {
    const d = segsToSvgPath(segs)
    this.elements.push(`<path d="${d}" fill="${colorToCSS(color)}" stroke="none"/>`)
  }

  strokePath(segs: Float64Array, color: number, width: number): void {
    const d = segsToSvgPath(segs)
    this.elements.push(`<path d="${d}" fill="none" stroke="${colorToCSS(color)}" stroke-width="${width.toFixed(2)}" stroke-linecap="round"/>`)
  }

  strokePathDashed(segs: Float64Array, color: number, width: number, dash: number): void {
    const d = segsToSvgPath(segs)
    this.elements.push(`<path d="${d}" fill="none" stroke="${colorToCSS(color)}" stroke-width="${width.toFixed(2)}" stroke-linecap="round" stroke-dasharray="${dash} ${dash}"/>`)
  }

  drawText(text: string, x: number, y: number, size: number, color: number, font: number): void {
    const fontFamily = FONTS[font] ?? FONTS[1]
    const lines = text.split('\n')
    const lineH = size * 1.4
    const totalH = lines.length * lineH
    const startY = y - totalH / 2 + lineH / 2

    for (let i = 0; i < lines.length; i++) {
      this.elements.push(
        `<text x="${x.toFixed(2)}" y="${(startY + i * lineH).toFixed(2)}" fill="${colorToCSS(color)}" font-family="${escapeXml(fontFamily)}" font-size="${size.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${escapeXml(lines[i])}</text>`
      )
    }
  }

  measureText(text: string, size: number, _font: number): [number, number] {
    // Approximate: 0.6 * size per character width
    const lines = text.split('\n')
    const maxW = Math.max(...lines.map(l => l.length * size * 0.6))
    return [maxW, lines.length * size * 1.4]
  }

  toPng(): Uint8Array {
    // Not applicable for SVG canvas
    throw new Error('SvgCanvas does not support toPng()')
  }

  toImageData(): Uint8Array {
    throw new Error('SvgCanvas does not support toImageData()')
  }

  toSvg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}">\n${this.elements.join('\n')}\n</svg>`
  }
}

export const svgCanvasFactory: CanvasFactory = {
  create(width: number, height: number): Canvas {
    return new SvgCanvas(width, height)
  },
}
