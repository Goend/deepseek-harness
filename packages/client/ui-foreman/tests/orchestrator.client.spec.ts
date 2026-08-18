import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  newWorkerUpdates,
  startSharedContextPump,
  type ContextSyncApi,
} from '../src/client/orchestrator.ts'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('shared-context orchestrator', () => {
  it('extracts only assistant text newer than the last seen seq', () => {
    const events = [
      { seq: 1, type: 'user/message', data: { message: { content: [{ type: 'text', text: 'ignored' }] } } },
      { seq: 2, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'A update' }] } } },
      { seq: 3, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'B update' }] } } },
    ]
    expect(newWorkerUpdates(events, 1)).toEqual([
      { seq: 2, text: 'A update' },
      { seq: 3, text: 'B update' },
    ])
    expect(newWorkerUpdates(events, 3)).toEqual([])
  })

  it('prompts other workers with shared context when one worker reports progress', async () => {
    const history = vi.fn().mockImplementation(async ({ sessionId }: { sessionId: string }) => ({
      result: { ok: true, value: { events: sessionId === 'session-a'
        ? [{ seq: 1, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'A changed auth.ts' }] } } }]
        : [] } },
    }))
    const prompt = vi.fn().mockResolvedValue({ result: { ok: true, value: { accepted: true } } })
    const api = { history, prompt } as unknown as ContextSyncApi
    const pump = startSharedContextPump(api, [
      { sessionId: 'session-a', workspacePath: '/repo/a' },
      { sessionId: 'session-b', workspacePath: '/repo/b' },
    ], 'shared-task-context', { pollIntervalMs: 1000 })

    await vi.advanceTimersByTimeAsync(1000)
    expect(history).toHaveBeenCalledWith({ sessionId: 'session-a', maxMessages: 50 })
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-b',
      mode: 'queue',
    }))
    const promptCall = prompt.mock.calls[0]![0] as { content: Array<{ type: 'text'; text: string }> }
    expect(promptCall.content[0]!.text).toContain('A changed auth.ts')
    pump.stop()
  })

  it('reports new worker updates through the onReport hook', async () => {
    const history = vi.fn().mockImplementation(async ({ sessionId }: { sessionId: string }) => ({
      result: { ok: true, value: { events: sessionId === 'session-a'
        ? [{ seq: 2, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'A new finding' }] } } }]
        : [] } },
    }))
    const prompt = vi.fn().mockResolvedValue({ result: { ok: true, value: { accepted: true } } })
    const onReport = vi.fn()
    const api = { history, prompt } as unknown as ContextSyncApi
    const pump = startSharedContextPump(api, [
      { sessionId: 'session-a', workspacePath: '/repo/a' },
      { sessionId: 'session-b', workspacePath: '/repo/b' },
    ], 'initial', { pollIntervalMs: 1000, onReport })

    await vi.advanceTimersByTimeAsync(1000)
    expect(onReport).toHaveBeenCalledWith(
      { sessionId: 'session-a', workspacePath: '/repo/a' },
      { seq: 2, text: 'A new finding' },
    )
    pump.stop()
  })

  it('does not resend the same worker update on later polls', async () => {
    const history = vi.fn().mockImplementation(async ({ sessionId }: { sessionId: string }) => ({
      result: { ok: true, value: { events: sessionId === 'session-a'
        ? [{ seq: 1, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'A update' }] } } }]
        : [] } },
    }))
    const prompt = vi.fn().mockResolvedValue({ result: { ok: true, value: { accepted: true } } })
    const api = { history, prompt } as unknown as ContextSyncApi
    const pump = startSharedContextPump(api, [
      { sessionId: 'session-a', workspacePath: '/repo/a' },
      { sessionId: 'session-b', workspacePath: '/repo/b' },
    ], 'initial', { pollIntervalMs: 1000 })

    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(prompt).toHaveBeenCalledTimes(1)
    pump.stop()
  })
})
