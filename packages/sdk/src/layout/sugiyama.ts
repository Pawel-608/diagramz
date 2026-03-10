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
    const { shapes, groupOf } = collectShapes(diagram)
    if (shapes.length === 0) return

    // Reverse inherit/implement edges so parents rank above children (UML convention)
    const origEdges: OrigEdge[] = diagram.connections.map(c => {
      const t = c.type
      const reversed = t === 'inherit' || t === 'implement'
      return {
        from: reversed ? c.target.id : c.from.id,
        to: reversed ? c.from.id : c.target.id,
        connection: c,
      }
    })

    const nodeIds = shapes.map(s => s.id)
    const simpleEdges = origEdges.map(e => ({ from: e.from, to: e.to }))

    // Phase 1: Rank assignment
    const ranks = longestPathRanking(nodeIds, simpleEdges)

    // Phase 2: Insert virtual nodes for long edges
    const virtualIds: string[] = []
    const augEdges: { from: string; to: string }[] = []
    const waypointMap = new Map<number, string[]>()

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

    // Phase 4.5: Cluster nodes by group within each layer
    // so group bounding boxes don't overlap on the cross-axis
    clusterByGroup(ordered, groupOf, augEdges)

    // Phase 5: Coordinate assignment
    const shapeMap = new Map<string, Shape>()
    for (const s of shapes) shapeMap.set(s.id, s)

    const virtualSet = new Set(virtualIds)
    const isHorizontal = this.direction === 'LR' || this.direction === 'RL'
    const isReversed = this.direction === 'BT' || this.direction === 'RL'

    // Cross-axis size for each node
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
    // Extra spacing at group boundaries so group boxes don't overlap
    const crossPos = new Map<string, number>()
    for (const layer of ordered) {
      let cursor = 0
      for (let i = 0; i < layer.length; i++) {
        const id = layer[i]
        const size = crossSize.get(id) ?? 0
        crossPos.set(id, cursor + size / 2)
        // Add extra gap when next node is in a different group
        let gap = this.spacing
        if (i < layer.length - 1) {
          const thisGroup = groupOf.get(id)
          const nextGroup = groupOf.get(layer[i + 1])
          if (thisGroup !== nextGroup) gap = this.spacing * 2
        }
        cursor += size + gap
      }
      const total = cursor - this.spacing
      for (const id of layer) {
        crossPos.set(id, (crossPos.get(id) ?? 0) - total / 2)
      }
    }

    // Iterative median refinement
    for (let iter = 0; iter < 30; iter++) {
      for (let li = 1; li < ordered.length; li++) {
        repositionLayer(ordered[li], upAdj, crossPos, crossSize, this.spacing, groupOf)
      }
      for (let li = ordered.length - 2; li >= 0; li--) {
        repositionLayer(ordered[li], downAdj, crossPos, crossSize, this.spacing, groupOf)
      }
    }

    // Phase 5.5: Pack disconnected components together
    packComponents(allIds, augEdges, crossPos, crossSize, this.spacing)

    // Phase 5.6: Assign groups to non-overlapping columns
    if (groupOf.size > 0) {
      assignGroupColumns(ordered, groupOf, crossPos, crossSize, this.spacing)
      centerOnZero(allIds, crossPos, crossSize)
    }

    // Phase 6: Compute layer main-axis positions based on actual node sizes
    // (so tall nodes don't overlap the next layer)
    const mainSize = new Map<string, number>() // main-axis size per node
    for (const id of allIds) {
      if (virtualSet.has(id)) {
        mainSize.set(id, 8)
      } else {
        const shape = shapeMap.get(id)
        if (shape) {
          const [w, h] = resolveSize(shape)
          mainSize.set(id, isHorizontal ? w : h)
        }
      }
    }

    // Max main-axis height per layer
    const layerMainSize: number[] = ordered.map(layer =>
      Math.max(0, ...layer.map(id => mainSize.get(id) ?? 0))
    )

    // Accumulate: each layer's center Y = previous bottom + gap + half current height
    const layerMainPos: number[] = []
    let mainCursor = 0
    for (let li = 0; li < ordered.length; li++) {
      const halfH = layerMainSize[li] / 2
      layerMainPos.push(mainCursor + halfH)
      mainCursor += layerMainSize[li] + this.layerSpacing
    }

    // Apply positions to shapes
    for (let li = 0; li < ordered.length; li++) {
      const logicalLayer = isReversed ? ordered.length - 1 - li : li
      const mainPos = layerMainPos[logicalLayer]
      for (const id of ordered[li]) {
        const shape = shapeMap.get(id)
        if (!shape) continue
        const [w, h] = resolveSize(shape)
        const cross = crossPos.get(id) ?? 0
        if (isHorizontal) {
          shape.x = mainPos - w / 2
          shape.y = cross - h / 2
        } else {
          shape.x = cross - w / 2
          shape.y = mainPos - h / 2
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
        const logicalLayer = isReversed ? ordered.length - 1 - rank : rank
        const main = layerMainPos[logicalLayer]
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

function collectShapes(diagram: Diagram): { shapes: Shape[]; groupOf: Map<string, string> } {
  const shapes: Shape[] = []
  const groupOf = new Map<string, string>()
  function walk(children: (Shape | Group)[], parentGroupId?: string) {
    for (const child of children) {
      if (child instanceof Group) {
        walk(child.children, child.id)
      } else {
        shapes.push(child)
        if (parentGroupId) groupOf.set(child.id, parentGroupId)
      }
    }
  }
  walk(diagram.children)
  return { shapes, groupOf }
}

/**
 * After crossing minimization, re-order each layer so nodes from the same
 * group are contiguous. Group order is determined by a global barycenter
 * so groups occupy consistent horizontal bands across all layers.
 */
function clusterByGroup(
  layers: string[][],
  groupOf: Map<string, string>,
  edges: { from: string; to: string }[],
): void {
  // If no groups, nothing to do
  if (groupOf.size === 0) return

  // Compute a global horizontal band for each group.
  // Use the average layer-position-index of each group's members as a proxy.
  const groupPositions = new Map<string, number[]>()
  for (const layer of layers) {
    for (let i = 0; i < layer.length; i++) {
      const g = groupOf.get(layer[i])
      if (g === undefined) continue
      if (!groupPositions.has(g)) groupPositions.set(g, [])
      groupPositions.get(g)!.push(i / Math.max(1, layer.length - 1))
    }
  }

  const groupCenter = new Map<string, number>()
  for (const [g, positions] of groupPositions) {
    groupCenter.set(g, positions.reduce((a, b) => a + b, 0) / positions.length)
  }

  // For ungrouped nodes, compute their median connected-group center
  // so they get placed near the groups they connect to
  const ungroupedCenter = new Map<string, number>()
  const adj = new Map<string, Set<string>>()
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, new Set())
    if (!adj.has(e.to)) adj.set(e.to, new Set())
    adj.get(e.from)!.add(e.to)
    adj.get(e.to)!.add(e.from)
  }

  for (const layer of layers) {
    for (const id of layer) {
      if (groupOf.has(id)) continue
      // Find groups of connected nodes
      const connectedGroupCenters: number[] = []
      for (const nb of adj.get(id) ?? []) {
        const g = groupOf.get(nb)
        if (g && groupCenter.has(g)) connectedGroupCenters.push(groupCenter.get(g)!)
      }
      if (connectedGroupCenters.length > 0) {
        connectedGroupCenters.sort((a, b) => a - b)
        const mid = Math.floor(connectedGroupCenters.length / 2)
        ungroupedCenter.set(id, connectedGroupCenters[mid])
      }
    }
  }

  // Re-sort each layer: grouped nodes cluster together, ungrouped fit near their connections
  for (const layer of layers) {
    const original = [...layer]
    layer.sort((a, b) => {
      const ga = groupOf.get(a)
      const gb = groupOf.get(b)
      const ca = ga ? groupCenter.get(ga)! : (ungroupedCenter.get(a) ?? 0.5)
      const cb = gb ? groupCenter.get(gb)! : (ungroupedCenter.get(b) ?? 0.5)
      if (Math.abs(ca - cb) > 1e-9) return ca - cb
      // Same group or same center: prefer same-group adjacency, then original order
      if (ga !== gb) return (ga ?? '') < (gb ?? '') ? -1 : 1
      return original.indexOf(a) - original.indexOf(b)
    })
  }
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

  // Topological order via Kahn's algorithm
  const queue: string[] = []
  for (const id of nodeIds) {
    if ((inDeg.get(id) ?? 0) === 0) queue.push(id)
  }
  if (queue.length === 0 && nodeIds.length > 0) queue.push(nodeIds[0])

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
      if (deg <= 0 && !visited.has(next)) queue.push(next)
    }
  }
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
    for (let i = 1; i < result.length; i++) {
      orderByMedian(result[i], result[i - 1], upAdj)
    }
    saveBest()
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
      medians.set(id, Infinity)
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

  const edgePairs: [number, number][] = []
  for (let ui = 0; ui < upper.length; ui++) {
    for (const target of downAdj.get(upper[ui]) ?? []) {
      const li = lowerPos.get(target)
      if (li !== undefined) edgePairs.push([ui, li])
    }
  }

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
  groupOf?: Map<string, string>,
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

  // Compute gap between two adjacent nodes (extra at group boundaries)
  const gapBetween = (a: string, b: string) => {
    if (groupOf && groupOf.get(a) !== groupOf.get(b)) return spacing * 2
    return spacing
  }

  // Fix overlaps: left-to-right pass
  for (let i = 1; i < layer.length; i++) {
    const prev = layer[i - 1]
    const curr = layer[i]
    const minGap = (crossSize.get(prev) ?? 0) / 2 + gapBetween(prev, curr) + (crossSize.get(curr) ?? 0) / 2
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
    const minGap = currSize / 2 + gapBetween(curr, next) + (crossSize.get(next) ?? 0) / 2
    const currPos = crossPos.get(curr) ?? 0
    const nextPos = crossPos.get(next) ?? 0
    const maxAllowed = nextPos - minGap
    const ideal = ideals.get(curr) ?? currPos
    if (currPos > maxAllowed) {
      crossPos.set(curr, maxAllowed)
    } else if (currPos > ideal) {
      const leftBound = i > 0
        ? (crossPos.get(layer[i - 1]) ?? 0) + (crossSize.get(layer[i - 1]) ?? 0) / 2 + gapBetween(layer[i - 1], curr) + currSize / 2
        : -Infinity
      crossPos.set(curr, Math.max(ideal, leftBound))
    }
  }
  // No centering shift — that was causing disconnected components to drift apart
}

/** Find connected components and pack them side-by-side */
function packComponents(
  allIds: string[],
  edges: { from: string; to: string }[],
  crossPos: Map<string, number>,
  crossSize: Map<string, number>,
  spacing: number,
): void {
  // Build undirected adjacency
  const adj = new Map<string, string[]>()
  for (const id of allIds) adj.set(id, [])
  for (const e of edges) {
    adj.get(e.from)?.push(e.to)
    adj.get(e.to)?.push(e.from)
  }

  // BFS to find connected components
  const visited = new Set<string>()
  const components: string[][] = []
  for (const id of allIds) {
    if (visited.has(id)) continue
    const comp: string[] = []
    const queue = [id]
    let head = 0
    while (head < queue.length) {
      const n = queue[head++]
      if (visited.has(n)) continue
      visited.add(n)
      comp.push(n)
      for (const nb of adj.get(n) ?? []) {
        if (!visited.has(nb)) queue.push(nb)
      }
    }
    components.push(comp)
  }

  if (components.length <= 1) {
    // Single component — just center on 0
    centerOnZero(allIds, crossPos, crossSize)
    return
  }

  // Compute bounding box of each component on the cross axis
  const bounds = components.map(comp => {
    let min = Infinity, max = -Infinity
    for (const id of comp) {
      const pos = crossPos.get(id) ?? 0
      const half = (crossSize.get(id) ?? 0) / 2
      min = Math.min(min, pos - half)
      max = Math.max(max, pos + half)
    }
    return { comp, min, max, width: max - min }
  })

  // Sort by current center so relative order is preserved
  bounds.sort((a, b) => (a.min + a.max) / 2 - (b.min + b.max) / 2)

  // Pack left-to-right with spacing between components
  let cursor = 0
  for (const { comp, min } of bounds) {
    const shift = cursor - min
    for (const id of comp) {
      crossPos.set(id, (crossPos.get(id) ?? 0) + shift)
    }
    // Recompute max after shift
    let newMax = -Infinity
    for (const id of comp) {
      const pos = crossPos.get(id) ?? 0
      newMax = Math.max(newMax, pos + (crossSize.get(id) ?? 0) / 2)
    }
    cursor = newMax + spacing
  }

  // Center everything on 0
  centerOnZero(allIds, crossPos, crossSize)
}

/**
 * Assign each group to a non-overlapping cross-axis column.
 * Preserves internal group layout — only shifts whole groups.
 * Ungrouped nodes are repositioned between groups based on their connections.
 */
function assignGroupColumns(
  layers: string[][],
  groupOf: Map<string, string>,
  crossPos: Map<string, number>,
  crossSize: Map<string, number>,
  spacing: number,
): void {
  const groups = Array.from(new Set(groupOf.values()))
  if (groups.length < 2) return

  // Compute cross-axis bounding box and centroid for each group
  const groupInfo = new Map<string, { min: number; max: number; center: number }>()
  for (const layer of layers) {
    for (const id of layer) {
      const g = groupOf.get(id)
      if (!g) continue
      const pos = crossPos.get(id) ?? 0
      const half = (crossSize.get(id) ?? 0) / 2
      if (!groupInfo.has(g)) {
        groupInfo.set(g, { min: pos - half, max: pos + half, center: 0 })
      } else {
        const info = groupInfo.get(g)!
        info.min = Math.min(info.min, pos - half)
        info.max = Math.max(info.max, pos + half)
      }
    }
  }
  for (const [, info] of groupInfo) {
    info.center = (info.min + info.max) / 2
  }

  // Sort groups by their current centroid
  const sorted = groups
    .filter(g => groupInfo.has(g))
    .sort((a, b) => groupInfo.get(a)!.center - groupInfo.get(b)!.center)

  // Pack groups into non-overlapping columns
  const gap = spacing * 1.5
  const columnCenter = new Map<string, number>()
  let cursor = 0
  for (const g of sorted) {
    const info = groupInfo.get(g)!
    const width = info.max - info.min
    columnCenter.set(g, cursor + width / 2)
    cursor += width + gap
  }

  // Center the columns around 0
  const totalWidth = cursor - gap
  const offset = totalWidth / 2

  // Compute shift for each group
  for (const g of sorted) {
    const info = groupInfo.get(g)!
    const target = columnCenter.get(g)! - offset
    const shift = target - info.center
    if (Math.abs(shift) < 0.1) continue

    // Shift all nodes in this group
    for (const layer of layers) {
      for (const id of layer) {
        if (groupOf.get(id) === g) {
          crossPos.set(id, (crossPos.get(id) ?? 0) + shift)
        }
      }
    }
  }

  // Re-sort layers by position (column shifts changed the order)
  for (const layer of layers) {
    layer.sort((a, b) => (crossPos.get(a) ?? 0) - (crossPos.get(b) ?? 0))
  }

  // Fix overlaps in each layer
  for (const layer of layers) {
    for (let i = 1; i < layer.length; i++) {
      const prev = layer[i - 1]
      const curr = layer[i]
      const interGroup = groupOf.get(prev) !== groupOf.get(curr)
      const g = interGroup ? spacing * 1.5 : spacing
      const minDist = (crossSize.get(prev) ?? 0) / 2 + g + (crossSize.get(curr) ?? 0) / 2
      const prevPos = crossPos.get(prev) ?? 0
      const currPos = crossPos.get(curr) ?? 0
      if (currPos < prevPos + minDist) {
        crossPos.set(curr, prevPos + minDist)
      }
    }
  }
}

function centerOnZero(
  allIds: string[],
  crossPos: Map<string, number>,
  crossSize: Map<string, number>,
): void {
  let min = Infinity, max = -Infinity
  for (const id of allIds) {
    const pos = crossPos.get(id) ?? 0
    const half = (crossSize.get(id) ?? 0) / 2
    min = Math.min(min, pos - half)
    max = Math.max(max, pos + half)
  }
  const shift = (min + max) / 2
  for (const id of allIds) {
    crossPos.set(id, (crossPos.get(id) ?? 0) - shift)
  }
}
