const NAMED: Record<string, number> = {
  black: 0x000000ff,
  white: 0xffffffff,
  red: 0xff0000ff,
  green: 0x008000ff,
  blue: 0x0000ffff,
  yellow: 0xffff00ff,
  orange: 0xffa500ff,
  purple: 0x800080ff,
  pink: 0xffc0cbff,
  gray: 0x808080ff,
  grey: 0x808080ff,
  cyan: 0x00ffffff,
  magenta: 0xff00ffff,
  lime: 0x00ff00ff,
  navy: 0x000080ff,
  teal: 0x008080ff,
  transparent: 0x00000000,
}

export function parseColor(color: string): number {
  const named = NAMED[color.toLowerCase()]
  if (named !== undefined) return named

  if (color.startsWith('#')) {
    const hex = color.slice(1)
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      return ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0
    }
    if (hex.length === 6) {
      return ((parseInt(hex, 16) << 8) | 0xff) >>> 0
    }
    if (hex.length === 8) {
      return parseInt(hex, 16) >>> 0
    }
  }

  return 0x000000ff
}

export function colorWithAlpha(color: number, alpha: number): number {
  return ((color & 0xffffff00) | (Math.round(alpha * 255) & 0xff)) >>> 0
}
