#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
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
const { wasmTargetFactory } = await import('./wasm-canvas.js')
const { renderToSvg } = await import('./render/loop.js')

const args = process.argv.slice(2)
const command = args[0]

function printHelp() {
  console.log(`Usage: diagramz <command> <input.js> [options]

Commands:
  render <input.js>    Render diagram to PNG or SVG (default)
  publish <input.js>   Publish to diagramz.xyz and get a shareable link

Render options:
  -o, --output <file>    Output file (default: diagram.png)
  -f, --format <fmt>     png | svg (default: guessed from output filename, or png)
  -e, --engine <name>    rough | clean (default: rough)
  -s, --scale <number>   Scale factor for PNG (default: 2)

Publish options:
  --api-url <url>        API base URL (default: https://diagramz.xyz)

General:
  -h, --help             Show this help

The input file should export a Diagram as default export or named "diagram".

Examples:
  diagramz render input.js
  diagramz render input.js -o output.svg
  diagramz render input.js -f svg -o my-diagram.svg
  diagramz render input.js -e clean -s 3
  diagramz publish input.js`)
}

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  printHelp()
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1)
}

if (command !== 'render' && command !== 'publish') {
  console.error(`Error: Unknown command "${command}". Use "render" or "publish".`)
  console.error('Run "diagramz --help" for usage.')
  process.exit(1)
}

const rest = args.slice(1)
let inputFile = ''
let outputFile = ''
let format = ''
let engineName = 'rough'
let scale = 2
let apiUrl = 'https://diagramz.xyz'

for (let i = 0; i < rest.length; i++) {
  const arg = rest[i]
  if (arg === '-o' || arg === '--output') {
    outputFile = rest[++i]
  } else if (arg === '-f' || arg === '--format') {
    format = rest[++i]
  } else if (arg === '-e' || arg === '--engine') {
    engineName = rest[++i]
  } else if (arg === '-s' || arg === '--scale') {
    scale = Number(rest[++i]) || 2
  } else if (arg === '--api-url') {
    apiUrl = rest[++i]
  } else if (!arg.startsWith('-')) {
    inputFile = arg
  }
}

if (!inputFile) {
  console.error('Error: No input file specified')
  process.exit(1)
}

// Resolve format: explicit --format wins, then guess from output filename, then default png
function resolveFormat(): 'png' | 'svg' {
  if (format === 'svg') return 'svg'
  if (format === 'png') return 'png'
  if (format) {
    console.error(`Error: Unknown format "${format}". Use "png" or "svg".`)
    process.exit(1)
  }
  if (outputFile) {
    if (outputFile.endsWith('.svg')) return 'svg'
    if (outputFile.endsWith('.png')) return 'png'
  }
  return 'png'
}

// Default output filename from input: input.js → input.png/svg
function defaultOutput(fmt: 'png' | 'svg'): string {
  const base = basename(inputFile).replace(/\.[^.]+$/, '')
  return `${base}.${fmt}`
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

if (command === 'publish') {
  // Read existing publish ID from source file comment or diagram object
  const source = readFileSync(fullPath, 'utf-8')
  const idMatch = source.match(/^\/\/\s*@diagramz-id\s+(\S+)/m)
  const existingId = d.id ?? idMatch?.[1]

  const json = d.toJSON()
  let id: string
  let url: string

  if (existingId) {
    // Update existing diagram via PATCH
    const res = await fetch(`${apiUrl}/api/v1/diagrams/${existingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: json }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error(`Error: Failed to update diagram (${res.status})`)
      console.error(err)
      process.exit(1)
    }
    id = existingId
    url = `/api/v1/diagrams/${id}`
    console.log(`Updated: ${apiUrl}/d/${id}`)
  } else {
    // Create new diagram via POST
    const res = await fetch(`${apiUrl}/api/v1/diagrams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: json }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error(`Error: Failed to publish (${res.status})`)
      console.error(err)
      process.exit(1)
    }
    const body = await res.json() as { id: string; url: string }
    id = body.id
    url = body.url
    console.log(`Published: ${apiUrl}${url}`)
  }

  // Write @diagramz-id back to source file
  let updatedSource: string
  if (idMatch) {
    updatedSource = source.replace(/^\/\/\s*@diagramz-id\s+\S+/m, `// @diagramz-id ${id}`)
  } else {
    updatedSource = `// @diagramz-id ${id}\n${source}`
  }
  writeFileSync(fullPath, updatedSource)

  console.log(`  View:    ${apiUrl}/d/${id}`)
  console.log(`  PNG:     ${apiUrl}/d/${id}/png`)
  console.log(`  SVG:     ${apiUrl}/d/${id}/svg`)
  console.log(`  ID saved to ${inputFile}`)
} else {
  const fmt = resolveFormat()
  if (!outputFile) outputFile = defaultOutput(fmt)

  const engine = engineName === 'clean' ? new CleanEngine() : new RoughEngine()
  const wrapCanvas = (t: import('./engines/canvas.js').RenderTarget) => engine.createCanvas(t)

  if (fmt === 'svg') {
    const svg = renderToSvg(d, wrapCanvas)
    writeFileSync(outputFile, svg)
    console.log(`Rendered ${outputFile} (${svg.length} bytes)`)
  } else {
    const png = engine.render(d, wasmTargetFactory, { scale })
    writeFileSync(outputFile, png)
    console.log(`Rendered ${outputFile} (${png.length} bytes)`)
  }
}
