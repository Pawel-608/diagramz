// Custom Node.js module loader that resolves 'diagramz' and 'diagramz/*'
// imports to this package, enabling npx usage without local install.
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgDir = join(__dirname, '..')

interface ResolveContext {
  parentURL?: string
  conditions: string[]
}

type NextResolve = (specifier: string, context: ResolveContext) => Promise<{ url: string; shortCircuit?: boolean }>

export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve,
): Promise<{ url: string; shortCircuit?: boolean }> {
  if (specifier === 'diagramz') {
    return { url: pathToFileURL(join(pkgDir, 'dist', 'index.js')).href, shortCircuit: true }
  }
  if (specifier.startsWith('diagramz/')) {
    const subpath = specifier.slice('diagramz/'.length)
    // Map known exports
    const exportMap: Record<string, string> = {
      'shapes/basic': 'dist/shapes/basic.js',
      'engines': 'dist/engines/index.js',
      'layout': 'dist/layout/index.js',
      'wasm-canvas': 'dist/wasm-canvas.js',
    }
    const mapped = exportMap[subpath]
    if (mapped) {
      return { url: pathToFileURL(join(pkgDir, mapped)).href, shortCircuit: true }
    }
  }
  return nextResolve(specifier, context)
}
