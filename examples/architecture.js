import { diagram, palettes } from 'diagramz'
import { classShape } from 'diagramz/shapes/uml'
import { Sugiyama } from 'diagramz/layout'

const d = diagram('Diagramz SDK — Current Architecture', {
  colors: palettes.pastel,
  layout: new Sugiyama({ direction: 'TB', spacing: 50, layerSpacing: 90 }),
})

// ── shapes/basic ──
const basicShapes = d.group('shapes/basic', { fillColor: '#fef7f5', color: '#c4867a' })

const rectShape = basicShapes.add(classShape('RectangleShape', {
  methods: [{ name: 'outline' }, { name: 'clipPoint' }],
}))

const ellipseShape = basicShapes.add(classShape('EllipseShape', {
  methods: [{ name: 'outline' }, { name: 'clipPoint' }],
}))

const diamondShape = basicShapes.add(classShape('DiamondShape', {
  methods: [{ name: 'outline' }, { name: 'clipPoint' }],
}))

const textShape = basicShapes.add(classShape('TextShape', {
  methods: [{ name: 'outline' }, { name: 'clipPoint' }],
}))

// ── shapes/uml ──
const umlShapes = d.group('shapes/uml', { fillColor: '#fef5f9', color: '#b8708a' })

const classBox = umlShapes.add(classShape('ClassShape', {
  fields: [
    { name: 'stereotype?', type: 'string' },
    { name: 'fields', type: 'Field[]' },
    { name: 'methods', type: 'Method[]' },
  ],
  methods: [{ name: 'render', params: 'canvas, ox, oy' }, { name: 'renderDetails', params: 'canvas, ...' }],
}))

// ── shapes/c4 ──
const c4 = d.group('shapes/c4', { fillColor: '#f5f7fe', color: '#7a86c4' })

const c4Person = c4.add(classShape('C4PersonShape', {
  methods: [{ name: 'render', params: 'canvas, ox, oy' }, { name: 'renderDetails' }],
}))

const c4Box = c4.add(classShape('C4BoxShape', {
  fields: [{ name: 'technology?', type: 'string' }, { name: 'description?', type: 'string' }],
  methods: [{ name: 'render', params: 'canvas, ox, oy' }, { name: 'renderDetails' }],
}))

// ── layout/ ──
const layoutGroup = d.group('layout/', { fillColor: '#f3faf5', color: '#7daa8a' })

const layout = layoutGroup.add(classShape('Layout', {
  stereotype: 'interface',
  methods: [{ name: 'apply', params: 'diagram', returns: 'void' }],
}))

const sugiyama = layoutGroup.add(classShape('Sugiyama', {
  fields: [{ name: 'direction', type: 'TB|LR|BT|RL' }, { name: 'spacing', type: 'number' }],
  methods: [{ name: 'apply', params: 'diagram', returns: 'void' }],
}))

// ── engines/ ──
const enginesGroup = d.group('engines/', { fillColor: '#fdf8f0', color: '#c4a46a' })

const canvas = enginesGroup.add(classShape('Canvas', {
  stereotype: 'interface',
  methods: [{ name: 'fillPath' }, { name: 'strokePath' }, { name: 'fillAndStrokePath' }, { name: 'drawText' }, { name: 'measureText' }],
}))

const renderTarget = enginesGroup.add(classShape('RenderTarget', {
  stereotype: 'interface',
  methods: [{ name: 'toPng', returns: 'Uint8Array' }, { name: 'toImageData', returns: 'Uint8Array' }],
}))

const cleanCanvas = enginesGroup.add(classShape('CleanCanvas', {
  fields: [{ name: 'target', type: 'Canvas', visibility: '-' }],
  methods: [{ name: 'fillAndStrokePath', params: '→ fill + stroke' }],
}))

const roughCanvas = enginesGroup.add(classShape('RoughCanvas', {
  fields: [{ name: 'target', type: 'Canvas', visibility: '-' }, { name: 'roughness', type: 'number' }, { name: 'seed', type: 'number' }],
  methods: [{ name: 'fillAndStrokePath', params: '→ hachure + wobble' }],
}))

const svgTarget = enginesGroup.add(classShape('SvgTarget', {
  methods: [{ name: 'toSvg', returns: 'string' }],
}))

const wasmTarget = enginesGroup.add(classShape('WasmTarget', {
  fields: [{ name: 'inner', type: 'RustCanvas', visibility: '-' }],
}))

// ── themes/ ──
const themesGroup = d.group('themes/', { fillColor: '#f8f4fc', color: '#a08ab8' })

const theme = themesGroup.add(classShape('Theme', {
  stereotype: 'interface',
  fields: [{ name: 'name', type: 'string' }, { name: 'shape', type: 'Record<type, colors>' }],
}))

// ── core/nodes ──
const nodesGroup = d.group('core/nodes', { fillColor: '#f5f8fe', color: '#8a9ab8' })

const diag = nodesGroup.add(classShape('Diagram', {
  fields: [
    { name: 'children', type: '(Shape|Group)[]', visibility: '-' },
    { name: 'connections', type: 'Connection[]', visibility: '-' },
    { name: 'layout', type: 'Layout', visibility: '-' },
  ],
  methods: [
    { name: 'add', params: 'shape: T', returns: 'T' },
    { name: 'group', params: 'label', returns: 'Group' },
    { name: 'render', params: 'engine, factory', returns: 'Uint8Array' },
  ],
}))

const node = nodesGroup.add(classShape('Node', {
  stereotype: 'interface',
  fields: [{ name: 'id', type: 'string' }, { name: 'label', type: 'string' }],
  methods: [{ name: 'to', params: 'target, label?, opts?', returns: 'Connection' }],
}))

const shape = nodesGroup.add(classShape('Shape', {
  stereotype: 'abstract',
  fields: [{ name: 'x, y, width, height' }, { name: 'color, fillColor' }],
  methods: [
    { name: 'outline', params: 'w, h', returns: 'Float64Array' },
    { name: 'clipPoint', params: 'w, h, angle' },
    { name: 'render', params: 'canvas, ox, oy' },
  ],
}))

const group = nodesGroup.add(classShape('Group', {
  fields: [{ name: 'children', type: '(Shape|Group)[]' }, { name: 'fillColor?', type: 'string' }],
  methods: [{ name: 'add', params: 'shape: T', returns: 'T' }, { name: 'render', params: 'canvas, ox, oy' }],
}))

// ── core/connections ──
const connsGroup = d.group('core/connections', { fillColor: '#fef5f0', color: '#b8946a' })

const connection = connsGroup.add(classShape('Connection', {
  fields: [
    { name: 'from, target', type: 'Node' },
    { name: 'type', type: 'ConnectionType' },
    { name: 'label?', type: 'string' },
    { name: 'waypoints', type: 'Point[]' },
  ],
  methods: [
    { name: 'render', params: 'canvas, offset' },
  ],
}))

const pathBuilder = connsGroup.add(classShape('PathBuilder', {
  stereotype: 'interface',
  methods: [
    { name: 'moveTo', params: 'x, y', returns: 'this' },
    { name: 'lineTo', params: 'x, y', returns: 'this' },
    { name: 'close', returns: 'this' },
    { name: 'build', returns: 'Float64Array' },
  ],
}))

// ── Relationships ──

// Node hierarchy
shape.to(node, '', { type: 'implement' })
group.to(node, '', { type: 'implement' })

// Diagram composition
diag.to(node, '', { type: 'compose' })
diag.to(connection, '', { type: 'compose' })
diag.to(layout, '', { type: 'aggregate' })
diag.to(theme, '', { type: 'depend' })

// Shape subtypes
rectShape.to(shape, '', { type: 'inherit' })
ellipseShape.to(shape, '', { type: 'inherit' })
diamondShape.to(shape, '', { type: 'inherit' })
textShape.to(shape, '', { type: 'inherit' })
classBox.to(shape, '', { type: 'inherit' })
c4Person.to(shape, '', { type: 'inherit' })
c4Box.to(shape, '', { type: 'inherit' })

// Layout
sugiyama.to(layout, '', { type: 'implement' })

// RenderTarget extends Canvas
renderTarget.to(canvas, '', { type: 'inherit' })

// Canvas implementations
cleanCanvas.to(canvas, '', { type: 'implement' })
roughCanvas.to(canvas, '', { type: 'implement' })

// RenderTarget implementations
svgTarget.to(renderTarget, '', { type: 'implement' })
wasmTarget.to(renderTarget, '', { type: 'implement' })

// Canvas decorators wrap a Canvas (which is a RenderTarget)
cleanCanvas.to(canvas, 'wraps', { type: 'aggregate' })
roughCanvas.to(canvas, 'wraps', { type: 'aggregate' })

// Shapes/groups/connections render themselves on Canvas
shape.to(canvas, '', { type: 'depend' })
group.to(canvas, '', { type: 'depend' })
connection.to(canvas, '', { type: 'depend' })
shape.to(pathBuilder, '', { type: 'depend' })
connection.to(pathBuilder, '', { type: 'depend' })

export default d
