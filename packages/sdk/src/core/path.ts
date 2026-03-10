export const MOVE_TO = 0
export const LINE_TO = 1
export const CUBIC_TO = 2
export const CLOSE = 3

export interface PathBuilder {
  moveTo(x: number, y: number): PathBuilder
  lineTo(x: number, y: number): PathBuilder
  cubicTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): PathBuilder
  close(): PathBuilder
  build(): Float64Array
}

export class DefaultPathBuilder implements PathBuilder {
  private cmds: number[] = []

  moveTo(x: number, y: number): this {
    this.cmds.push(MOVE_TO, x, y)
    return this
  }

  lineTo(x: number, y: number): this {
    this.cmds.push(LINE_TO, x, y)
    return this
  }

  cubicTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): this {
    this.cmds.push(CUBIC_TO, x1, y1, x2, y2, x, y)
    return this
  }

  close(): this {
    this.cmds.push(CLOSE)
    return this
  }

  build(): Float64Array {
    return new Float64Array(this.cmds)
  }
}

export function translatePath(path: Float64Array, dx: number, dy: number): Float64Array {
  const result = new Float64Array(path.length)
  let i = 0
  while (i < path.length) {
    const cmd = path[i]
    result[i] = cmd
    if (cmd === MOVE_TO || cmd === LINE_TO) {
      result[i + 1] = path[i + 1] + dx
      result[i + 2] = path[i + 2] + dy
      i += 3
    } else if (cmd === CUBIC_TO) {
      result[i + 1] = path[i + 1] + dx
      result[i + 2] = path[i + 2] + dy
      result[i + 3] = path[i + 3] + dx
      result[i + 4] = path[i + 4] + dy
      result[i + 5] = path[i + 5] + dx
      result[i + 6] = path[i + 6] + dy
      i += 7
    } else {
      i += 1
    }
  }
  return result
}
