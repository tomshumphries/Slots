// Web Worker for running Monte Carlo simulation off the main thread.
// Receives a SimConfig, streams progress messages, then posts the final SimResult.

import { runSimulation } from './simRunner'
import type { SimConfig, SimProgress, SimResult } from './types'

type WorkerInMessage = { type: 'start'; config: SimConfig } | { type: 'cancel' }

type WorkerOutMessage =
  | { type: 'progress'; data: SimProgress }
  | { type: 'result'; data: SimResult }
  | { type: 'error'; message: string }
  | { type: 'cancelled' }

let abortController: AbortController | null = null

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data

  if (msg.type === 'cancel') {
    abortController?.abort()
    return
  }

  if (msg.type === 'start') {
    abortController = new AbortController()

    try {
      const result = await runSimulation(
        msg.config,
        (progress: SimProgress) => {
          self.postMessage({ type: 'progress', data: progress } satisfies WorkerOutMessage)
        },
        abortController.signal
      )
      self.postMessage({ type: 'result', data: result } satisfies WorkerOutMessage)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        self.postMessage({ type: 'cancelled' } satisfies WorkerOutMessage)
      } else {
        self.postMessage({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        } satisfies WorkerOutMessage)
      }
    }
  }
}
