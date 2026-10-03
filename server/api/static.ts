import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { HttpError } from './http'

/**
 * Derlenmiş arayüzü (dist/) API ile aynı adresten sunar; böylece oturum çerezi aynı kökene kalır
 * (SameSite=Strict). Arayüz hash yönlendirme kullandığı için bilinmeyen yol index.html'e düşer.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
}

export function serveStatic(app: FastifyInstance, dir: string): void {
  const root = resolve(dir)
  app.get('/*', async (req, reply) => {
    const path = decodeURIComponent(req.url.split('?')[0])
    if (path.startsWith('/api/')) throw new HttpError(404, 'Uç nokta bulunamadı')
    let file = resolve(root, `.${path === '/' ? '/index.html' : path}`)
    // Kök dışına çıkan yol (../) reddedilir
    if (file !== root && !file.startsWith(root + sep)) throw new HttpError(404, 'Bulunamadı')
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html')
    const immutable = file.startsWith(join(root, 'assets') + sep)
    return reply
      .header('content-type', TYPES[extname(file)] ?? 'application/octet-stream')
      .header('cache-control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
      .send(createReadStream(file))
  })
}
