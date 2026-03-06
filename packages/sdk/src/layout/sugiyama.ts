import type { Layout } from './layout.js'
import type { Diagram } from '../core/diagram.js'
import { Shape, resolveSize } from '../core/shape.js'
import { Group } from '../core/group.js'
import type { Connection } from '../core/connection.js'

export type Direction = 'TB' | 'LR' | 'BT' | 'RL'

export interface SugiyamaOpts {
  direction?: Direction
  spacing?: number
  layerSpacing?: number
}

interface OrigEdge {
  from: string
  to: string
  connection: Connection
}

export class Sugiyama implements Layout {
  readonly direction: Direction
  readonly spacing: number
  readonly layerSpacing: number

  constructor(opts?: SugiyamaOpts) {
    this.direction = opts?.direction ?? 'TB'
    this.spacing = opts?.spacing ?? 80
    this.layerSpacing = opts?.layerSpacing ?? 120
  }

  apply(diagram: Diagram): void {
    const shapes = collectShapes(diagram)
    if (shapes.length === 0) return

    const origEdges: OrigEdge[] = diagram.connections.map(c => ({
      from: c.from.id,
      to: c.target.id,
      connection: c,
    }))

    const nodeIds = shapes.map(s => s.id)
    const simpleEdges = origEdges.map(e => ({ from: e.from, to: e.to }))

    // Phase 1: Rank assignment
    const ranks = longestPathRanking(nodeIds, simpleEdges)

    // Phase 2: Insert virtual nodes for long edges
    const virtualIds: string[] = []
    const augEdges: { from: string; to: string }[] = []
    const waypointMap = new Map<number, string[]>() // edge index → virtual node ids

    for (let ei = 0; ei < origEdges.length; ei++) {
      const e = origEdges[ei]
      const fromRank = ranks.get(e.from) ?? 0
      const toRank = ranks.get(e.to) ?? 0

      if (toRank - fromRank <= 1) {
        augEdges.push({ from: e.from, to: e.to })
      } else {
        const vIds: string[] = []
        let prev = e.from
        for (let r = fromRank + 1; r < toRank; r++) {
          const vId = `__v_${ei}_${r}`
          virtualIds.push(vId)
          ranks.set(vId, r)
          augEdges.push({ from: prev, to: vId })
          vIds.push(vId)
          prev = vId
        }
        augEdges.push({ from: prev, to: e.to })
        waypointMap.set(ei, vIds)
      }
    }

    // Phase 3: Build layers
    const allIds = [...nodeIds, ...virtualIds]
    const layers = buildLayers(allIds, ranks)

    // Phase 4: Minimize crossings
    const ordered = minimizeCrossings(layers, augEdges)

    // Phase 5: Coordinate assignment
    const shapeMap = new Map<string, Shape>()
    for (const s of shapes) shapeMap.set(s.id, s)

    const virtualSet = new Set(virtualIds)
    const isHorizontal = this.direction === 'LR' || this.direction === 'RL'
    const isReversed = this.direction === 'BT' || this.direction === 'RL'

    // Cross-axis size for each node (virtual nodes get small size so edges route between real nodes)
    const crossSize = new Map<string, number>()
    for (const id of allIds) {
      if (virtualSet.has(id)) {
        crossSize.set(id, 8)
      } else {
        const shape = shapeMap.get(id)
        if (shape) {
          const [w, h] = resolveSize(shape)
          crossSize.set(id, isHorizontal ? h : w)
        }
      }
    }

    // Adjacency on augmented graph
    const upAdj = new Map<string, string[]>()
    const downAdj = new Map<string, string[]>()
    for (const e of augEdges) {
      if (!downAdj.has(e.from)) downAdj.set(e.from, [])
      downAdj.get(e.from)!.push(e.to)
      if (!upAdj.has(e.to)) upAdj.set(e.to, [])
      upAdj.get(e.to)!.push(e.from)
    }

    // Initial placement: spread each layer evenly, centered on 0
    const crossPos = new Map<string, number>()
    for (const layer of ordered) {
      let cursor = 0
      for (const id of layer) {
        const size = crossSize.get(id) ?? 0
        crossPos.set(id, cursor + size / 2)
        cursor += size + this.spacing
      }
      const total = cursor - this.spacing
      for (const id of layer) {
        crossPos.set(id, (crossPos.get(id) ?? 0) - total / 2)
      }
    }

    // Iterative median refinement
    for (let iter = 0; iter < 30; iter++) {
      // Down sweep
      for (let li = 1; li < ordered.length; li++) {
        repositionLayer(ordered[li], upAdj, crossPos, crossSize, this.spacing)
      }
      // Up sweep
      for (let li = ordered.length - 2; li >= 0; li--) {
        repositionLayer(ordered[li], downAdj, crossPos, crossSize, this.spacing)
      }
    }

    // Phase 6: Apply positions to shapes
    for (let li = 0; li < ordered.length; li++) {
      const layerIdx = isReversed ? ordered.length - 1 - li : li
      for (const id of ordered[li]) {
        const shape = shapeMap.get(id)
        if (!shape) continue
        const [w, h] = resolveSize(shape)
        const cross = crossPos.get(id) ?? 0
        if (isHorizontal) {
          shape.x = layerIdx * this.layerSpacing
          shape.y = cross - h / 2
        } else {
          shape.x = cross - w / 2
          shape.y = layerIdx * this.layerSpacing
        }
        shape.width = w
        shape.height = h
      }
    }

    // Phase 7: Extract waypoints for connections
    for (let ei = 0; ei < origEdges.length; ei++) {
      const conn = origEdges[ei].connection
      const vIds = waypointMap.get(ei)
      if (!vIds || vIds.length === 0) {
        conn.waypoints = []
        continue
      }
      conn.waypoints = vIds.map(vId => {
        const cross = crossPos.get(vId) ?? 0
        const rank = ranks.get(vId) ?? 0
        const layerIdx = isReversed ? ordered.length - 1 - rank : rank
        const main = layerIdx * this.layerSpacing
        if (isHorizontal) {
          return { x: main, y: cross }
        } else {
          return { x: cross, y: main }
        }
      })
    }
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

  // Topological order via Kahn's algorithm to avoid infinite loops on cycles
  const queue: string[] = []
  for (const id of nodeIds) {
    if ((inDeg.get(id) ?? 0) === 0) {
      queue.push(id)
    }
  }
  if (queue.length === 0 && nodeIds.length > 0) {
    queue.push(nodeIds[0])
  }

  const topoOrder: string[] = []
  const visited = new Set<string>()
  let head = 0
  while (head < queue.length) {
    const node = queue[head++]
    if (visited.has(node)) continue
    visited.add(node)
    topoOrder.push(node)
    for (const next of adj.get(node) ?? []) {
      const deg = (inDeg.get(next) ?? 1) - 1
      inDeg.set(next, deg)
      if (deg <= 0 && !visited.has(next)) {
        queue.push(next)
      }
    }
  }
  // Add any unvisited nodes
  for (const id of nodeIds) {
    if (!visited.has(id)) topoOrder.push(id)
  }

  // Longest path in topological order
  for (const id of topoOrder) {
    if (!ranks.has(id)) ranks.set(id, 0)
    const rank = ranks.get(id)!
    for (const next of adj.get(id) ?? []) {
      const newRank = rank + 1
      if (!ranks.has(next) || ranks.get(next)! < newRank) {
        ranks.set(next, newRank)
      }
    }
  }

  for (const id of nodeIds) {
    if (!ranks.has(id)) ranks.set(id, 0)
  }

  return ranks
}

function buildLayers(nodeIds: string[], ranks: Map<string, number>): string[][] {
  const maxRank = Math.max(0, ...Array.from(ranks.values()))
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => [])
  for (const id of nodeIds) {
    layers[ranks.get(id) ?? 0].push(id)
  }
  return layers
}

function minimizeCrossings(
  layers: string[][],
  edges: { from: string; to: string }[],
): string[][] {
  const result = layers.map(l => [...l])

  const downAdj = new Map<string, string[]>()
  const upAdj = new Map<string, string[]>()
  for (const e of edges) {
    if (!downAdj.has(e.from)) downAdj.set(e.from, [])
    downAdj.get(e.from)!.push(e.to)
    if (!upAdj.has(e.to)) upAdj.set(e.to, [])
    upAdj.get(e.to)!.push(e.from)
  }

  let bestCrossings = countAllCrossings(result, downAdj)
  let best = result.map(l => [...l])

  const saveBest = () => {
    const c = countAllCrossings(result, downAdj)
    if (c < bestCrossings) {
      bestCrossings = c
      best = result.map(l => [...l])
    }
  }

  for (let iter = 0; iter < 16; iter++) {
    // Forward pass
    for (let i = 1; i < result.length; i++) {
      orderByMedian(result[i], result[i - 1], upAdj)
    }
    saveBest()
    // Backward pass
    for (let i = result.length - 2; i >= 0; i--) {
      orderByMedian(result[i], result[i + 1], downAdj)
    }
    saveBest()
  }

  return best
}

function orderByMedian(
  layer: string[],
  refLayer: string[],
  adj: Map<string, string[]>,
): void {
  const refPos = new Map<string, number>()
  refLayer.forEach((id, idx) => refPos.set(id, idx))

  const medians = new Map<string, number>()
  for (const id of layer) {
    const neighbors = adj.get(id) ?? []
    const positions = neighbors
      .map(n => refPos.get(n))
      .filter((p): p is number => p !== undefined)
      .sort((a, b) => a - b)

    if (positions.length === 0) {
      medians.set(id, Infinity) // keep current relative position
    } else if (positions.length % 2 === 1) {
      medians.set(id, positions[Math.floor(positions.length / 2)])
    } else {
      const mid = positions.length / 2
      medians.set(id, (positions[mid - 1] + positions[mid]) / 2)
    }
  }

  layer.sort((a, b) => {
    const ma = medians.get(a) ?? Infinity
    const mb = medians.get(b) ?? Infinity
    return ma - mb
  })
}

function countAllCrossings(
  layers: string[][],
  downAdj: Map<string, string[]>,
): number {
  let total = 0
  for (let li = 0; li < layers.length - 1; li++) {
    total += countCrossings(layers[li], layers[li + 1], downAdj)
  }
  return total
}

function countCrossings(
  upper: string[],
  lower: string[],
  downAdj: Map<string, string[]>,
): number {
  const lowerPos = new Map<string, number>()
  lower.forEach((id, idx) => lowerPos.set(id, idx))

  // Collect edge position pairs
  const edgePairs: [number, number][] = []
  for (let ui = 0; ui < upper.length; ui++) {
    for (const target of downAdj.get(upper[ui]) ?? []) {
      const li = lowerPos.get(target)
      if (li !== undefined) {
        edgePairs.push([ui, li])
      }
    }
  }

  // Count inversions (crossings)
  let crossings = 0
  for (let i = 0; i < edgePairs.length; i++) {
    for (let j = i + 1; j < edgePairs.length; j++) {
      const [u1, l1] = edgePairs[i]
      const [u2, l2] = edgePairs[j]
      if ((u1 - u2) * (l1 - l2) < 0) crossings++
    }
  }
  return crossings
}

function repositionLayer(
  layer: string[],
  neighborAdj: Map<string, string[]>,
  crossPos: Map<string, number>,
  crossSize: Map<string, number>,
  spacing: number,
): void {
  // Compute ideal positions (median of neighbors)
  const ideals = new Map<string, number>()
  for (const id of layer) {
    const neighbors = neighborAdj.get(id) ?? []
    if (neighbors.length === 0) {
      ideals.set(id, crossPos.get(id) ?? 0)
      continue
    }
    const positions = neighbors.map(n => crossPos.get(n) ?? 0).sort((a, b) => a - b)
    const mid = Math.floor(positions.length / 2)
    const median = positions.length % 2 === 1
      ? positions[mid]
      : (positions[mid - 1] + positions[mid]) / 2
    ideals.set(id, median)
  }

  // Apply ideal positions
  for (const id of layer) {
    crossPos.set(id, ideals.get(id) ?? 0)
  }

  // Fix overlaps: left-to-right pass (maintain ordering from crossing minimization)
  for (let i = 1; i < layer.length; i++) {
    const prev = layer[i - 1]
    const curr = layer[i]
    const prevSize = crossSize.get(prev) ?? 0
    const currSize = crossSize.get(curr) ?? 0
    const minGap = prevSize / 2 + spacing + currSize / 2
    const prevPos = crossPos.get(prev) ?? 0
    const currPos = crossPos.get(curr) ?? 0
    if (currPos < prevPos + minGap) {
      crossPos.set(curr, prevPos + minGap)
    }
  }

  // Right-to-left pass: pull nodes back toward ideals where possible
  for (let i = layer.length - 2; i >= 0; i--) {
    const curr = layer[i]
    const next = layer[i + 1]
    const currSize = crossSize.get(curr) ?? 0
    const nextSize = crossSize.get(next) ?? 0
    const minGap = currSize / 2 + spacing + nextSize / 2
    const currPos = crossPos.get(curr) ?? 0
    const nextPos = crossPos.get(next) ?? 0
    const maxAllowed = nextPos - minGap
    const ideal = ideals.get(curr) ?? currPos
    if (currPos > maxAllowed) {
      crossPos.set(curr, maxAllowed)
    } else if (currPos > ideal) {
      // Pull back toward ideal, but don't violate left neighbor constraint
      crossPos.set(curr, Math.max(ideal, i > 0
        ? (crossPos.get(layer[i - 1]) ?? 0) + (crossSize.get(layer[i - 1]) ?? 0) / 2 + spacing + currSize / 2
        : -Infinity))
    }
  }

  // Center the layer around the average ideal position to prevent drift
  if (layer.length > 1) {
    const avgIdeal = layer.reduce((s, id) => s + (ideals.get(id) ?? 0), 0) / layer.length
    const avgActual = layer.reduce((s, id) => s + (crossPos.get(id) ?? 0), 0) / layer.length
    const shift = avgIdeal - avgActual
    for (const id of layer) {
      crossPos.set(id, (crossPos.get(id) ?? 0) + shift)
    }
  }
}
