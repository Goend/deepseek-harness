/** Foreman view-tab registration and its injected business face. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-foreman/client'
import type { ForemanSettings, OrgChartInjected, OrgData } from '@deepseek-ai/dsh-client-ui-foreman/client'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const settings = stubSettingsScope<ForemanSettings>()
  ctx.provide('settingsScope', { bind: () => settings.scope } as never)
  const slots = ctx.get('slots') as SlotRegistry
  // ui-conversation's body entry declares this ring; the test stands in for it.
  slots.register({
    name: 'root',
    children: { 'conversation.view': { kind: 'list', scope: 'session' } },
  } as never, () => null)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { slots, settings, fiber }
}

describe('ui-foreman apply', () => {
  it('declares only slots + locale + settingsScope', () => {
    expect(inject).toEqual(['slots', 'locale', 'settingsScope'])
  })

  it('registers the foreman view tab with an injected data face', async () => {
    const { slots, fiber } = await bench()
    const entries = slots.entries('conversation.view')
    expect(entries).toHaveLength(1)
    expect(entries[0]!.options.id).toBe('foreman')
    const label = entries[0]!.options.label as () => string
    expect(label()).toBe('组织架构')
    const injected = (entries[0]!.inject as unknown as () => OrgChartInjected)()
    expect(injected.getConnection().url).toBe('http://127.0.0.1:8787/rpc')
    expect(typeof injected.listOrg).toBe('function')
    expect(typeof injected.saveConnection).toBe('function')
    fiber.dispose()
  })

  it('saveConnection completes a scheme-less address and listOrg reuses it immediately', async () => {
    const { slots, settings, fiber } = await bench()
    settings.publish({
      status: 'ready',
      value: { foremanUrl: 'http://127.0.0.1:8787/rpc', token: '' },
      revision: 1,
      writable: true,
    })
    const injected = (slots.entries('conversation.view')[0]!.inject as unknown as () => OrgChartInjected)()
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ result: { nodes: [], memberships: [] } }) })
    globalThis.fetch = fetchMock as never

    await injected.saveConnection('192.3.39.195:8787/rpc', '476ff072')
    expect(settings.set).toHaveBeenCalledWith('foremanUrl', 'http://192.3.39.195:8787/rpc')
    expect(settings.set).toHaveBeenCalledWith('token', '476ff072')
    expect(injected.getConnection()).toEqual({ url: 'http://192.3.39.195:8787/rpc', token: '476ff072' })

    await injected.listOrg()
    expect(fetchMock).toHaveBeenCalledWith('http://192.3.39.195:8787/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer 476ff072' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'list_org' }),
    })
    await fiber.dispose()
  })

  it('listOrg fetches the org tree and falls back to an empty org', async () => {
    const { slots, fiber } = await bench()
    const injected = (slots.entries('conversation.view')[0]!.inject as unknown as () => OrgChartInjected)()
    const org: OrgData = { nodes: [], memberships: [] }

    const ok = vi.fn().mockResolvedValue({ json: async () => ({ result: org }) })
    globalThis.fetch = ok as never
    expect(await injected.listOrg()).toEqual(org)

    const missing = vi.fn().mockResolvedValue({ json: async () => ({}) })
    globalThis.fetch = missing as never
    expect(await injected.listOrg()).toEqual({ nodes: [], memberships: [] })
    fiber.dispose()
  })

  it('dispatches, lists node tasks, and rejects through the injected face', async () => {
    const { slots, settings, fiber } = await bench()
    settings.publish({ status: 'ready', value: { foremanUrl: 'http://x/rpc', token: 'tok' }, revision: 1, writable: true })
    const injected = (slots.entries('conversation.view')[0]!.inject as unknown as () => OrgChartInjected)()
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ result: [] }) })
    globalThis.fetch = fetchMock as never

    await injected.assignTask({ description: 'x', changeIntent: 'additive', assignee: 'bob' })
    await injected.listNodeTasks('frontend')
    await injected.rejectTask('task-1')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const bodies = fetchMock.mock.calls.map(c => JSON.parse(c[1]!.body as string).method)
    expect(bodies).toEqual(['assign_task', 'list_node_tasks', 'reject_task'])
    await fiber.dispose()
  })

  it('falls back to the default URL when the saved address is invalid', async () => {
    const { slots, settings, fiber } = await bench()
    settings.publish({ status: 'ready', value: { foremanUrl: 'not a url with spaces', token: '' }, revision: 1, writable: true })
    const injected = (slots.entries('conversation.view')[0]!.inject as unknown as () => OrgChartInjected)()
    expect(injected.getConnection().url).toBe('http://127.0.0.1:8787/rpc')
    await fiber.dispose()
  })

  it('throws when the server returns a JSON-RPC error', async () => {
    const { slots, settings, fiber } = await bench()
    settings.publish({ status: 'ready', value: { foremanUrl: 'http://x/rpc', token: '' }, revision: 1, writable: true })
    const injected = (slots.entries('conversation.view')[0]!.inject as unknown as () => OrgChartInjected)()
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ error: { message: 'boom' } }) })
    globalThis.fetch = fetchMock as never
    await expect(injected.listOrg()).rejects.toThrow('boom')
    await fiber.dispose()
  })

  it('listNodeTasks falls back to empty when the server returns no result', async () => {
    const { slots, settings, fiber } = await bench()
    settings.publish({ status: 'ready', value: { foremanUrl: 'http://x/rpc', token: '' }, revision: 1, writable: true })
    const injected = (slots.entries('conversation.view')[0]!.inject as unknown as () => OrgChartInjected)()
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({}) })
    globalThis.fetch = fetchMock as never
    expect(await injected.listNodeTasks('frontend')).toEqual([])
    await fiber.dispose()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
