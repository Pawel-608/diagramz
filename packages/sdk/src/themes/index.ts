/**
 * Preset color palettes — just arrays of hex colors.
 * Pass to `diagram(title, { colors: palettes.blueprint })`.
 */
export const palettes: Record<string, string[]> = {
  default:   ['#4A90D9', '#50B86C', '#E6854A', '#9B6FD4', '#E05B5B', '#D4A84E', '#4ABCD9', '#D94A8C'],
  blueprint: ['#1565c0', '#1e88e5', '#42a5f5', '#64b5f6', '#90caf9', '#bbdefb'],
  earth:     ['#4e342e', '#6d4c41', '#795548', '#8d6e63', '#a1887f', '#bcaaa4'],
  mono:      ['#212121', '#424242', '#616161', '#757575', '#9e9e9e', '#bdbdbd'],
  pastel:    ['#bbdefb', '#c8e6c9', '#ffe0b2', '#e1bee7', '#fff9c4', '#b2dfdb', '#f8bbd0', '#d1c4e9'],
  c4:        ['#08427B', '#1168BD', '#438DD5', '#85BBF0', '#999999', '#6b9dc8'],
}

/**
 * Returns black or white depending on the luminance of the given hex color.
 */
export function contrastColor(hex: string): string {
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

/**
 * Apply a color palette to shapes and groups that lack explicit colors.
 * Each shape cycles through the palette for its fill; text/stroke color
 * is auto-derived for contrast. Groups get translucent palette fills.
 */
export function applyPalette(
  shapes: { fillColor?: string; color?: string }[],
  groups: { fillColor?: string; color?: string }[],
  colors: string[],
): void {
  if (colors.length === 0) return

  let idx = 0
  for (const shape of shapes) {
    if (!shape.fillColor) {
      shape.fillColor = colors[idx % colors.length]
      idx++
    }
    if (!shape.color) {
      shape.color = contrastColor(shape.fillColor)
    }
  }

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]
    if (!group.fillColor) {
      group.fillColor = colors[i % colors.length] + '20'
    }
    if (!group.color) {
      group.color = colors[i % colors.length]
    }
  }
}
