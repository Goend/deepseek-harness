/** Foreman view-tab registration and its injected business face. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-foreman/client'
import type { OrgChartInjected, OrgData } from '@deepseek-ai/dsh-client-ui-foreman/client'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const slots = ctx.get('slots') as SlotRegistry
  // ui-conversation's body entry declares this ring; the test stands in for it.
  slots.register({
    name: 'root',
    children: { 'conversation.view': { kind: 'list', scope: 'session' } },
  }, () => null)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { slots, fiber }
}

describe('ui-foreman apply', () => {
  it('declares only slots + locale', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('registers the foreman view tab with an injected data face', async () => {
    const { slots, fiber } = await bench()
    const entries = slots.entries('conversation.view')
    expect(entries).toHaveLength(1)
    expect(entries[0]!.options.id).toBe('foreman')
    const label = entries[0]!.options.label as () => string
    expect(label()).toBe('组织架构')
    const injected = (entries[0]!.inject as () => OrgChartInjected)('sid' as never)
    expect(injected.foremanUrl).toBe('http://127.0.0.1:8787/rpc')
    expect(typeof injected.listOrg).toBe('function')
    fiber.dispose()
  })

  it('listOrg fetches the org tree and falls back to an empty org', async () => {
    const { slots, fiber } = await bench()
    const injected = (slots.entries('conversation.view')[0]!.inject as () => OrgChartInjected)('sid' as never)
    const org: OrgData = { nodes: [], memberships: [] }

    const ok = vi.fn().mockResolvedValue({ json: async () => ({ result: org }) })
    globalThis.fetch = ok as never
    expect(await injected.listOrg()).toEqual(org)

    const missing = vi.fn().mockResolvedValue({ json: async () => ({}) })
    globalThis.fetch = missing as never
    expect(await injected.listOrg()).toEqual({ nodes: [], memberships: [] })
    fiber.dispose()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
