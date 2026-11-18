import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build as viteBuild, type Plugin } from 'vite'

const SOURCE = fileURLToPath(new URL('../src/sw.ts', import.meta.url))
const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url))

// config.js carries the signing secret at runtime (estate ADR-041 point 6). The other two
// are licence texts no screen loads.
const NOT_PRECACHED = new Set(['config.js', 'fonts/OFL.txt', 'third-party-licenses.md'])

// Dotfiles (a stray .DS_Store) are refused by nginx and would fail the install.
const publicFiles = (): string[] =>
  readdirSync(PUBLIC_DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => relative(PUBLIC_DIR, join(entry.parentPath, entry.name)))
    .sort()

/**
 * Writes `sw.js` beside the build: `src/sw.ts` with the shell's file list and a version made
 * from every file's content, so any change to the shell is a new worker with a new cache.
 */
export function serviceWorkerPlugin(): Plugin {
  let precache: string[] = []
  let version = ''
  let outDir = ''
  let base = ''
  return {
    name: 'adventure-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
      base = config.base
    },
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        // The worker's own source counts: an install under an unchanged cache name that failed
        // would delete the cache the running worker still uses.
        const hash = createHash('sha256').update(readFileSync(SOURCE))
        const outputs = Object.values(bundle).sort((a, b) => a.fileName.localeCompare(b.fileName))
        for (const output of outputs) {
          hash.update(output.fileName)
          hash.update(output.type === 'chunk' ? output.code : output.source)
        }
        const statics = publicFiles()
        for (const file of statics) {
          hash.update(file)
          hash.update(readFileSync(`${PUBLIC_DIR}${file}`))
        }
        version = hash.digest('hex').slice(0, 12)
        const emitted = outputs.map(({ fileName }) => fileName).filter((name) => name !== 'index.html')
        precache = ['', ...emitted, ...statics].filter((path) => !NOT_PRECACHED.has(path))
      },
    },
    async closeBundle(error) {
      if (error || !version) return
      await viteBuild({
        configFile: false,
        logLevel: 'warn',
        define: {
          __SW_VERSION__: JSON.stringify(version),
          __SW_BASE__: JSON.stringify(base),
          __SW_PRECACHE__: JSON.stringify(precache),
        },
        build: {
          outDir,
          emptyOutDir: false,
          copyPublicDir: false,
          sourcemap: false,
          minify: true,
          lib: { entry: SOURCE, formats: ['iife'], name: 'adventureWorker', fileName: () => 'sw.js' },
        },
      })
    },
  }
}
