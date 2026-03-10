import { diagram, palettes } from 'diagramz'
import { classShape } from 'diagramz/shapes/uml'
import { Sugiyama } from 'diagramz/layout'

const d = diagram('Connection Architecture', {
  colors: palettes.pastel,
  layout: new Sugiyama({ direction: 'TB', spacing: 60, layerSpacing: 120 }),
})

// ── The interface ──
const conn = d.add(classShape('Connection', {
  stereotype: 'interface',
  fields: [
    { name: 'from', type: 'Node' },
    { name: 'target', type: 'Node' },
    { name: 'label?', type: 'string' },
    { name: 'color?', type: 'string' },
    { name: 'strokeWidth?', type: 'number' },
    { name: 'waypoints', type: 'Point[]' },
  ],
  methods: [
    { name: 'dashed', returns: 'boolean' },
    { name: 'sourceDecor', params: 'pt, angle, canvas', returns: 'void' },
    { name: 'targetDecor', params: 'pt, angle, canvas', returns: 'void' },
  ],
}))

// ── Base with shared logic ──
const base = d.add(classShape('BaseConnection', {
  stereotype: 'abstract',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'from', type: 'Node' },
    { name: 'target', type: 'Node' },
  ],
  methods: [
    { name: 'dashed', returns: 'false' },
    { name: 'sourceDecor', returns: 'noop' },
    { name: 'targetDecor', returns: 'noop' },
  ],
}))

// ── Basic connections ──
const basicGroup = d.group('basic connections', { fillColor: '#f5f7fa', color: '#94a3b8' })

const line = basicGroup.add(classShape('LineConnection', {
  methods: [
    { name: 'dashed', returns: 'false' },
  ],
}))

const arrow = basicGroup.add(classShape('ArrowConnection', {
  methods: [
    { name: 'targetDecor', returns: 'open chevron' },
  ],
}))

// ── UML connections ──
const umlGroup = d.group('uml connections', { fillColor: '#fef5f9', color: '#b8708a' })

const inherit = umlGroup.add(classShape('InheritConnection', {
  methods: [
    { name: 'targetDecor', returns: 'closed triangle' },
  ],
}))

const implement = umlGroup.add(classShape('ImplementConnection', {
  methods: [
    { name: 'dashed', returns: 'true' },
    { name: 'targetDecor', returns: 'closed triangle' },
  ],
}))

const compose = umlGroup.add(classShape('ComposeConnection', {
  methods: [
    { name: 'sourceDecor', returns: 'filled diamond' },
  ],
}))

const aggregate = umlGroup.add(classShape('AggregateConnection', {
  methods: [
    { name: 'sourceDecor', returns: 'hollow diamond' },
  ],
}))

const depend = umlGroup.add(classShape('DependConnection', {
  methods: [
    { name: 'dashed', returns: 'true' },
    { name: 'targetDecor', returns: 'open chevron' },
  ],
}))

// ── Who calls what ──
const engine = d.add(classShape('Engine', {
  stereotype: 'abstract',
  methods: [
    { name: 'renderConnection', params: 'path, conn, from, to, angle, canvas' },
  ],
}))

// ── Relationships ──
base.to(conn, '', { type: 'implement' })

line.to(base, '', { type: 'inherit' })
arrow.to(base, '', { type: 'inherit' })
inherit.to(base, '', { type: 'inherit' })
implement.to(base, '', { type: 'inherit' })
compose.to(base, '', { type: 'inherit' })
aggregate.to(base, '', { type: 'inherit' })
depend.to(base, '', { type: 'inherit' })

engine.to(conn, 'calls dashed/sourceDecor/targetDecor', { type: 'depend' })

export default d
