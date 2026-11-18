// Serves a build as web/nginx.conf does: the app under /adventure/, the runtime config.js,
// immutable hashed assets, and index.html for an unknown path. Files are read per request, so
// a spec deploys by writing into the served directory.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { SERVED_DIR, TEST_SECRET } from './paths'

const BASE = '/adventure/'
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
}

createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname
  if (!path.startsWith(BASE)) {
    response.statusCode = 404
    response.end()
    return
  }
  const relative = path.slice(BASE.length)
  if (relative === 'config.js') {
    response.setHeader('Content-Type', 'application/javascript')
    response.setHeader('Cache-Control', 'no-store')
    response.end(`window.__ADVENTURE_CONFIG__ = { "apiSecret": "${TEST_SECRET}" };\n`)
    return
  }
  let file = join(SERVED_DIR, relative)
  const found = existsSync(file) && statSync(file).isFile()
  if (!found && (relative.startsWith('assets/') || relative === 'sw.js' || relative.startsWith('api/'))) {
    response.statusCode = 404
    response.end()
    return
  }
  if (!found) file = join(SERVED_DIR, 'index.html')
  response.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
  response.setHeader(
    'Cache-Control',
    relative.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache, must-revalidate',
  )
  createReadStream(file).pipe(response)
}).listen(Number(process.env.PORT), '127.0.0.1')
