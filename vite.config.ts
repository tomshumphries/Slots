import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync, readFileSync, readdirSync, unlinkSync, mkdirSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import type { IncomingMessage, ServerResponse } from 'http'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'sim-api',
      configureServer(server) {
        server.middlewares.use(
          '/api/sim-results',
          (req: IncomingMessage, res: ServerResponse) => {
            const dir = resolve(__dirname, 'sim-results')
            // req.url is relative to the mount path, e.g. "/" or "/my-run-id"
            const runId = (req.url ?? '/').replace(/^\//, '').split('?')[0]

            res.setHeader('Content-Type', 'application/json')

            // ── GET /api/sim-results — list metadata for all saved runs ──────────
            if (req.method === 'GET' && !runId) {
              try {
                if (!existsSync(dir)) { res.end('[]'); return }
                const runs = readdirSync(dir)
                  .filter(f => f.endsWith('.json'))
                  .map(file => {
                    try {
                      const data = JSON.parse(readFileSync(join(dir, file), 'utf-8'))
                      return {
                        runId:              data.meta?.runId ?? file.replace('.json', ''),
                        label:              data.meta?.label ?? '',
                        timestamp:          data.meta?.timestamp ?? '',
                        normalSpins:        data.meta?.normalSpins ?? 0,
                        bonusSpins:         data.meta?.bonusSpins ?? 0,
                        durationMs:         data.meta?.durationMs ?? 0,
                        rtpPercent:         data.summary?.rtpPercent ?? 0,
                        ciHalfWidthPercent: data.summary?.ciHalfWidthPercent ?? 0,
                      }
                    } catch { return null }
                  })
                  .filter(Boolean)
                runs.sort((a, b) => (b!.timestamp > a!.timestamp ? 1 : -1))
                res.statusCode = 200
                res.end(JSON.stringify(runs))
              } catch (err) {
                res.statusCode = 500
                res.end(JSON.stringify({ error: String(err) }))
              }
              return
            }

            // ── GET /api/sim-results/:runId — load one full result ───────────────
            if (req.method === 'GET' && runId) {
              if (!/^[\w-]+$/.test(runId)) {
                res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid runId' })); return
              }
              try {
                const content = readFileSync(join(dir, `${runId}.json`), 'utf-8')
                res.statusCode = 200
                res.end(content)
              } catch {
                res.statusCode = 404
                res.end(JSON.stringify({ error: 'Not found' }))
              }
              return
            }

            // ── POST /api/sim-results — save a run ───────────────────────────────
            if (req.method === 'POST') {
              let body = ''
              req.on('data', (chunk: Buffer) => { body += chunk.toString() })
              req.on('end', () => {
                try {
                  const data = JSON.parse(body)
                  const id: string = data?.meta?.runId
                  if (!id || !/^[\w-]+$/.test(id)) {
                    res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid runId' })); return
                  }
                  mkdirSync(dir, { recursive: true })
                  writeFileSync(join(dir, `${id}.json`), JSON.stringify(data, null, 2), 'utf-8')
                  res.statusCode = 200
                  res.end(JSON.stringify({ ok: true, file: `sim-results/${id}.json` }))
                } catch (err) {
                  res.statusCode = 500
                  res.end(JSON.stringify({ error: String(err) }))
                }
              })
              return
            }

            // ── DELETE /api/sim-results/:runId — delete a run ───────────────────
            if (req.method === 'DELETE' && runId) {
              if (!/^[\w-]+$/.test(runId)) {
                res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid runId' })); return
              }
              try {
                unlinkSync(join(dir, `${runId}.json`))
                res.statusCode = 200
                res.end(JSON.stringify({ ok: true }))
              } catch {
                res.statusCode = 404
                res.end(JSON.stringify({ error: 'Not found' }))
              }
              return
            }

            res.statusCode = 405
            res.end(JSON.stringify({ error: 'Method not allowed' }))
          }
        )
      },
    },
  ],
})
