import type { Layout } from './layout.js'
import type { Diagram } from '../core/diagram.js'
import type { Node } from '../core/node.js'
import { Shape, resolveSize } from '../core/shape.js'
import { Group } from '../core/group.js'

export type Direction = 'TB' | 'LR' | 'BT' | 'RL'

export interface SugiyamaOpts {
  direction?: Direction
  spacing?: number
  layerSpacing?: number
}

export class Sugiyama implements Layout {
  readonly direction: Direction
  readonly spacing: number
  readonly layerSpacing: number

  constructor(opts?: SugiyamaOpts) {
    this.direction = opts?.direction ?? 'TB'
    this.spacing = opts?.spacing ?? 60
    this.layerSpacing = opts?.layerSpacing ?? 100
  }

  apply(diagram: Diagram): void {
    const shapes = collectShapes(diagram)
    if (shapes.length === 0) return

    const edges = diagram.connections.map(c => ({
      from: c.from.id,
      to: c.target.id,
    }))

    const nodeIds = shapes.map(s => s.id)
    const ranks = longestPathRanking(nodeIds, edges)
    const layers = buildLayers(nodeIds, ranks)
    const ordered = barycenterOrdering(layers, edges)
    assignCoordinates(ordered, shapes, this)
  }

  toJSON(): unknown {
    return {
      name: 'sugiyama',
      direction: this.direction,
      spacing: this.spacing,
      layerSpacing: this.layerSpacing,
    }
  }
}

function collectShapes(diagram: Diagram): Shape[] {
  const result: Shape[] = []
  function walk(children: (Shape | Group)[]) {
    for (const child of children) {
      if (child instanceof Group) {
        walk(child.children)
      } else {
        result.push(child)
      }
    }
  }
  walk(diagram.children)
  return result
}

function longestPathRanking(
  nodeIds: string[],
  edges: { from: string; to: string }[],
): Map<string, number> {
  const ranks = new Map<string, number>()
  const adj = new Map<string, string[]>()
  const inDeg = new Map<string, number>()

  for (const id of nodeIds) {
    adj.set(id, [])
    inDeg.set(id, 0)
  }
  for (const e of edges) {
    if (adj.has(e.from) && adj.has(e.to)) {
      adj.get(e.from)!.push(e.to)
      inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1)
    }
  }

  // BFS from sources
  const queue: string[] = []
  for (const id of nodeIds) {
    if ((inDeg.get(id) ?? 0) === 0) {
      ranks.set(id, 0)
      queue.push(id)
    }
  }

  // If no sources (cycle), start from first node
  if (queue.length === 0 && nodeIds.length > 0) {
    ranks.set(nodeIds[0], 0)
    queue.push(nodeIds[0])
  }

  let head = 0
  while (head < queue.length) {
    const node = queue[head++]
    const rank = ranks.get(node)!
    for (const next of adj.get(node) ?? []) {
      const newRank = rank + 1
      if (!ranks.has(next) || ranks.get(next)! < newRank) {
        ranks.set(next, newRank)
        queue.push(next)
      }
    }
  }

  // Assign rank 0 to any unvisited nodes
  for (const id of nodeIds) {
    if (!ranks.has(id)) ranks.set(id, 0)
  }

  return ranks
}

function buildLayers(
  nodeIds: string[],
  ranks: Map<string, number>,
): string[][] {
  const maxRank = Math.max(0, ...Array.from(ranks.values()))
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => [])
  for (const id of nodeIds) {
    layers[ranks.get(id) ?? 0].push(id)
  }
  return layers
}

function barycenterOrdering(
  layers: string[][],
  edges: { from: string; to: string }[],
): string[][] {
  const result = layers.map(l => [...l])

  // Build adjacency for fast lookup
  const downAdj = new Map<string, string[]>()
  const upAdj = new Map<string, string[]>()
  for (const e of edges) {
    if (!downAdj.has(e.from)) downAdj.set(e.from, [])
    downAdj.get(e.from)!.push(e.to)
    if (!upAdj.has(e.to)) upAdj.set(e.to, [])
    upAdj.get(e.to)!.push(e.from)
  }

  // Iterate a few times to reduce crossings
  for (let iter = 0; iter < 4; iter++) {
    // Forward pass
    for (let i = 1; i < result.length; i++) {
      const prevPositions = new Map<string, number>()
      result[i - 1].forEach((id, idx) => prevPositions.set(id, idx))

      result[i].sort((a, b) => {
        const aNeighbors = upAdj.get(a) ?? []
        const bNeighbors = upAdj.get(b) ?? []
        const aBarycenter = aNeighbors.length > 0
          ? aNeighbors.reduce((s, n) => s + (prevPositions.get(n) ?? 0), 0) / aNeighbors.length
          : Infinity
        const bBarycenter = bNeighbors.length > 0
          ? bNeighbors.reduce((s, n) => s + (prevPositions.get(n) ?? 0), 0) / bNeighbors.length
          : Infinity
        return aBarycenter - bBarycenter
      })
    }

    // Backward pass
    for (let i = result.length - 2; i >= 0; i--) {
      const nextPositions = new Map<string, number>()
      result[i + 1].forEach((id, idx) => nextPositions.set(id, idx))

      result[i].sort((a, b) => {
        const aNeighbors = downAdj.get(a) ?? []
        const bNeighbors = downAdj.get(b) ?? []
        const aBarycenter = aNeighbors.length > 0
          ? aNeighbors.reduce((s, n) => s + (nextPositions.get(n) ?? 0), 0) / aNeighbors.length
          : Infinity
        const bBarycenter = bNeighbors.length > 0
          ? bNeighbors.reduce((s, n) => s + (nextPositions.get(n) ?? 0), 0) / bNeighbors.length
          : Infinity
        return aBarycenter - bBarycenter
      })
    }
  }

  return result
}

function assignCoordinates(
  layers: string[][],
  shapes: Shape[],
  layout: Sugiyama,
): void {
  const shapeMap = new Map<string, Shape>()
  for (const s of shapes) shapeMap.set(s.id, s)

  const isHorizontal = layout.direction === 'LR' || layout.direction === 'RL'
  const isReversed = layout.direction === 'BT' || layout.direction === 'RL'

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li]
    const layerIdx = isReversed ? layers.length - 1 - li : li

    // Compute total width of this layer for centering
    let totalSpan = 0
    const sizes: [number, number][] = []
    for (const id of layer) {
      const shape = shapeMap.get(id)
      if (!shape) continue
      const [w, h] = resolveSize(shape)
      sizes.push([w, h])
      totalSpan += isHorizontal ? h : w
    }
    totalSpan += (layer.length - 1) * layout.spacing

    let cursor = -totalSpan / 2
    for (let i = 0; i < layer.length; i++) {
      const shape = shapeMap.get(layer[i])
      if (!shape) continue
      const [w, h] = sizes[i]
      const span = isHorizontal ? h : w

      if (isHorizontal) {
        shape.x = layerIdx * layout.layerSpacing
        shape.y = cursor
      } else {
        shape.x = cursor
        shape.y = layerIdx * layout.layerSpacing
      }

      shape.width = w
      shape.height = h
      cursor += span + layout.spacing
    }
  }
}
