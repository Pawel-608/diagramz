#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { register } from 'node:module'

// Register custom loader so user files can `import 'diagramz'` without
// having the package locally installed (npx scenario)
const __dirname = dirname(fileURLToPath(import.meta.url))
register(pathToFileURL(join(__dirname, 'loader.js')).href, { parentURL: import.meta.url })

const { Diagram } = await import('./core/diagram.js')
const { CleanEngine } = await import('./engines/clean.js')
const { RoughEngine } = await import('./engines/rough.js')
const { wasmCanvasFactory } = await import('./wasm-canvas.js')

const args = process.argv.slice(2)

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: diagramz <input.js> [options]

Options:
  -o, --output <file>    Output PNG file (default: diagram.png)
  -e, --engine <name>    Engine: rough | clean (default: rough)
  -s, --scale <number>   Scale factor (default: 2)
  -h, --help             Show this help

The input file should export a Diagram as default export or named "diagram".

Example input.js:
  import { diagram } from 'diagramz'
  import { rectangle } from 'diagramz/shapes/basic'

  const d = diagram("My System")
  const api = d.add(rectangle("API"))
  const db = d.add(rectangle("Database"))
  api.to(db, "queries")
  export default d`)
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1)
}

let inputFile = ''
let outputFile = 'diagram.png'
let engineName = 'rough'
let scale = 2

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '-o' || arg === '--output') {
    outputFile = args[++i]
  } else if (arg === '-e' || arg === '--engine') {
    engineName = args[++i]
  } else if (arg === '-s' || arg === '--scale') {
    scale = Number(args[++i]) || 2
  } else if (!arg.startsWith('-')) {
    inputFile = arg
  }
}

if (!inputFile) {
  console.error('Error: No input file specified')
  process.exit(1)
}

const fullPath = resolve(inputFile)
const fileUrl = pathToFileURL(fullPath).href

let mod: Record<string, unknown>
try {
  mod = await import(fileUrl)
} catch (err) {
  console.error(`Error: Failed to load ${inputFile}`)
  console.error((err as Error).message)
  process.exit(1)
}

const d = (mod.default ?? mod.diagram) as InstanceType<typeof Diagram> | undefined
if (!d || !(d instanceof Diagram)) {
  console.error('Error: Input file must export a Diagram as default or named "diagram"')
  console.error('Available exports:', Object.keys(mod).join(', '))
  process.exit(1)
}

const engine = engineName === 'clean' ? new CleanEngine() : new RoughEngine()
const png = engine.render(d, wasmCanvasFactory, { scale })

writeFileSync(outputFile, png)
console.log(`Rendered ${outputFile} (${png.length} bytes)`)
