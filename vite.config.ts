import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import type { IncomingMessage, ServerResponse } from 'http'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'sim-writer',
      configureServer(server) {
        server.middlewares.use(
          '/api/write-sim',
          (req: IncomingMessage, res: ServerResponse) => {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.end('Method not allowed')
              return
            }

            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', () => {
              try {
                const data = JSON.parse(body)
                const runId: string = data?.meta?.runId
                if (!runId || !/^[\w-]+$/.test(runId)) {
                  res.statusCode = 400
                  res.end('Invalid runId')
                  return
                }

                const dir = resolve(__dirname, 'sim-results')
                mkdirSync(dir, { recursive: true })
                const filePath = join(dir, `${runId}.json`)
                writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')

                res.statusCode = 200
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ ok: true, file: `sim-results/${runId}.json` }))
              } catch (err) {
                res.statusCode = 500
                res.end(String(err))
              }
            })
          }
        )
      },
    },
  ],
})
