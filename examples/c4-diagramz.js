import { diagram, palettes } from 'diagramz'
import { c4Person, c4System, c4Container, c4Database, c4ExternalSystem } from 'diagramz/shapes/c4'
import { Sugiyama } from 'diagramz/layout'

const d = diagram('Diagramz - C4 Container', {
  colors: palettes.c4,
  layout: new Sugiyama({ direction: 'TB', spacing: 80, layerSpacing: 130 }),
})

// Actors
const agent = d.add(c4Person('AI Agent', {
  description: 'Claude Code or other\nAI coding assistants.',
}))

const human = d.add(c4Person('Human User', {
  description: 'Views and edits diagrams\nin the browser.',
}))

// Core system boundary
const spa = d.add(c4Container('Web SPA', {
  description: 'Interactive canvas for\nviewing and editing diagrams.',
  technology: 'React + WASM',
}))

const api = d.add(c4Container('API Server', {
  description: 'REST API for CRUD\noperations on diagrams.',
  technology: 'Axum / Rust',
}))

const renderer = d.add(c4Container('Renderer', {
  description: 'Shared rendering engine.\nPixel + SVG output.',
  technology: 'tiny-skia / Rust',
}))

const db = d.add(c4Database('SQLite', {
  description: 'Stores diagram JSON\nwith 30-day TTL.',
  technology: 'rusqlite / WAL',
}))

const sdk = d.add(c4ExternalSystem('SDK', {
  description: 'Diagrams-as-code library.\nPublished to npm.',
  technology: 'TypeScript',
}))

// Relationships
agent.to(api, 'POST/PATCH diagrams via REST')
agent.to(sdk, 'Builds diagrams with')
human.to(spa, 'Views and edits diagrams')

spa.to(api, 'Fetches diagram data')
spa.to(renderer, 'Renders via WASM')

api.to(renderer, 'Renders PNG/SVG')
api.to(db, 'Reads/writes diagrams')

export default d
