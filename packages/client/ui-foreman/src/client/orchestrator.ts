/**
 * Browser-side shared-context orchestrator for multi-workspace worker sessions.
 *
 * It polls each worker session's history for new assistant text, merges it into
 * a shared context block, and prompts every other worker with the latest
 * shared context. This is the message-driven equivalent of
 * `reportFrom` + `followup` using the public session API.
 */

export interface SessionEventLike {
  readonly seq: number
  readonly type: string
  readonly data?: {
    readonly message?: {
      readonly content?: readonly { readonly type: string; readonly text?: string }[]
    }
  }
}

export interface ContextSyncApi {
  history(payload: { sessionId: string; maxMessages?: number }): Promise<{
    result:
      | { ok: true; value: { events: SessionEventLike[] } }
      | { ok: false; error: { message: string } }
  }>
  prompt(payload: {
    sessionId: string
    mode: 'queue'
    content: readonly { type: 'text'; text: string }[]
  }): Promise<{ result: { ok: true; value: { accepted: boolean } } | { ok: false; error: { message: string } } }>
}

export interface WorkerHandle {
  readonly sessionId: string
  readonly workspacePath: string
}

export interface SharedContextOptions {
  readonly pollIntervalMs?: number
  readonly onError?: (error: unknown) => void
  /** Called for each newly detected worker update; can report to Foreman. */
  readonly onReport?: (worker: WorkerHandle, update: { seq: number; text: string }) => void | Promise<void>
}

/** Extract plain assistant text from a session event, if any. */
export function assistantText(event: SessionEventLike): string {
  if (event.type !== 'assistant/message') return ''
  const content = event.data?.message?.content ?? []
  return content
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text ?? '')
    .join('')
}

/** Find assistant messages newer than the last seen seq for a worker. */
export function newWorkerUpdates(
  events: readonly SessionEventLike[],
  lastSeenSeq: number | undefined,
): { seq: number; text: string }[] {
  const updates: { seq: number; text: string }[] = []
  for (const event of events) {
    if (lastSeenSeq !== undefined && event.seq <= lastSeenSeq) continue
    const text = assistantText(event)
    if (text !== '') updates.push({ seq: event.seq, text })
  }
  return updates
}

/** Build a compact shared-context update block for follow-up prompts. */
export function formatSharedContextUpdate(
  workerLabel: string,
  text: string,
  previousShared: string,
): string {
  return [
    '## 共享上下文更新',
    '',
    `来自 ${workerLabel}：`,
    text,
    '',
    '## 当前共享上下文（含此前更新）',
    previousShared,
  ].join('\n')
}

/**
 * Start polling workers and propagating updates to their peers.
 * @returns a stop handle to cancel the polling loop.
 */
export function startSharedContextPump(
  api: ContextSyncApi,
  workers: readonly WorkerHandle[],
  initialContext: string,
  options: SharedContextOptions = {},
): { stop(): void } {
  const pollIntervalMs = options.pollIntervalMs ?? 3000
  const seen = new Map<string, number>()
  let shared = initialContext
  let timer: ReturnType<typeof setInterval> | undefined

  async function poll(): Promise<void> {
    for (const worker of workers) {
      try {
        const response = await api.history({ sessionId: worker.sessionId, maxMessages: 50 })
        if (!response.result.ok) continue
        const updates = newWorkerUpdates(response.result.value.events, seen.get(worker.sessionId))
        if (updates.length === 0) continue
        seen.set(worker.sessionId, Math.max(seen.get(worker.sessionId) ?? 0, ...updates.map(u => u.seq)))
        for (const update of updates) await options.onReport?.(worker, update)
        const workerLabel = worker.workspacePath.split('/').filter(Boolean).pop() ?? worker.sessionId
        for (const update of updates) {
          shared = formatSharedContextUpdate(workerLabel, update.text, shared)
        }
        const updatePrompt = `其他工作区有新的进展，请先阅读共享上下文更新：\n\n${shared}`
        for (const peer of workers) {
          if (peer.sessionId === worker.sessionId) continue
          const promptResponse = await api.prompt({
            sessionId: peer.sessionId,
            mode: 'queue',
            content: [{ type: 'text', text: updatePrompt }],
          })
          if (!promptResponse.result.ok) options.onError?.(new Error(promptResponse.result.error.message))
        }
      } catch (error) {
        options.onError?.(error)
      }
    }
  }

  timer = setInterval(() => { void poll() }, pollIntervalMs)

  return {
    stop(): void {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
    },
  }
}
