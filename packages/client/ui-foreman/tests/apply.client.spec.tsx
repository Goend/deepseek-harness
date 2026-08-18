/** Foreman view-tab registration and its injected business face. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-foreman/client'
import type { OrgChartInjected, OrgData } from '@deepseek-ai/dsh-client-ui-foreman/client'
import type { ForemanSettings } from '../src/foreman-settings.ts'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const settings = stubSettingsScope<ForemanSettings>()
  ctx.provide('settingsScope', { bind: () => settings.scope } as never)
  const connectionApi = {
    workspace: {
      list: vi.fn(async () => ({ result: { ok: true, value: { items: [] } } })),
      create: vi.fn(async () => ({ result: { ok: true, value: { workspace: { workspaceId: 'ws-1', path: '/tmp', title: 'tmp' }, created: true } } })),
    },
    sessions: {
      create: vi.fn(async () => ({ result: { ok: true, value: { sessionId: 'session-1' } } })),
      prompt: vi.fn(async () => ({ result: { ok: true, value: { accepted: true } } })),
    },
  }
  ctx.provide('connection', { api: connectionApi } as never)
  const slots = ctx.get('slots') as SlotRegistry
  // ui-conversation's body entry declares this ring; the test stands in for it.
  slots.register({
    name: 'root',
    children: { 'conversation.view': { kind: 'list', scope: 'session' } },
  } as never, () => null)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { slots, settings, connectionApi, fiber }
}

describe('ui-foreman apply', () => {
  it('declares slots + locale + settingsScope + connection', () => {
    expect(inject).toEqual(['slots', 'locale', 'settingsScope', 'connection'])
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
    void fiber.dispose()
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

    await injected.saveConnection({ url: '192.3.39.195:8787/rpc', token: '476ff072' })
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
    void fiber.dispose()
  })

  it('dispatches, lists node tasks, and rejects through the injected face', async () => {
    const { slots, settings, fiber } = await bench()
    settings.publish({ status: 'ready', value: { foremanUrl: 'http://x/rpc', token: 'tok' }, revision: 1, writable: true })
    const injected = (slots.entries('conversation.view')[0]!.inject as unknown as () => OrgChartInjected)()
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ result: [] }) })
    globalThis.fetch = fetchMock as never

    await injected.assignTask({ id: 'task-1', description: 'x', brief: 'docs/x.md', changeIntent: 'additive', assignee: 'bob' })
    await injected.listNodeTasks('frontend')
    await injected.rejectTask('task-1')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>
    const bodies = calls.map(([, init]) => JSON.parse(init.body as string) as { method: string; params?: { brief?: string } })
    expect(bodies.map(body => body.method)).toEqual(['assign_task', 'list_node_tasks', 'reject_task'])
    expect(bodies[0]!.params?.brief).toBe('docs/x.md')
    await fiber.dispose()
  })

  it('resolves identity, lists my tasks, and claims through the token', async () => {
    const { slots, settings, fiber } = await bench()
    settings.publish({ status: 'ready', value: { foremanUrl: 'http://x/rpc', token: 'tok' }, revision: 1, writable: true })
    const injected = (slots.entries('conversation.view')[0]!.inject as unknown as () => OrgChartInjected)()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ result: { userId: 'u-2', token: 'tok', name: 'alice' } }) })
      .mockResolvedValueOnce({ json: async () => ({ result: [] }) })
      .mockResolvedValueOnce({ json: async () => ({ result: { task: { id: 'task-1' } } }) })
    globalThis.fetch = fetchMock as never

    expect(await injected.whoami()).toEqual({ userId: 'u-2', name: 'alice' })
    expect(await injected.listMyTasks()).toEqual([])
    await injected.claimTask('task-1')
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>
    const methods = calls.map(([, init]) => JSON.parse(init.body as string) as { method: string }).map(body => body.method)
    expect(methods).toEqual(['whoami', 'list_my_tasks', 'claim_my_task'])
    await fiber.dispose()
  })

  it('falls back to the default URL when the saved address is invalid', async () => {
    const { slots, settings, fiber } = await bench()
    settings.publish({ status: 'ready', value: { foremanUrl: 'not a url with spaces', token: '' }, revision: 1, writable: true })
    const injected = (slots.entries('conversation.view')[0]!.inject as unknown as () => OrgChartInjected)()
    expect(injected.getConnection().url).toBe('http://127.0.0.1:8787/rpc')
    await fiber.dispose()
  })

  it('proxies Jira credential and issue reads through Foreman RPC', async () => {
    const { slots, settings, fiber } = await bench()
    settings.publish({ status: 'ready', value: { foremanUrl: 'http://x/rpc', token: 'tok' }, revision: 1, writable: true })
    const injected = (slots.entries('conversation.view')[0]!.inject as unknown as () => OrgChartInjected)()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ result: { userId: 'u-2', configured: true } }) })
      .mockResolvedValueOnce({ json: async () => ({ result: { key: 'EAS-1', summary: 'x', descriptionText: '', status: 'Open', statusId: '1', issueType: 'Story', issueTypeId: '10001', subtask: false, parentKey: null, assignee: null, reporter: null, priority: null, components: [], fixVersions: [], attachments: [], comments: [], created: '', updated: '', url: '' } }) })
    globalThis.fetch = fetchMock as never

    await injected.jiraSetCredential('a@b.c', 'secret')
    expect(await injected.jiraGetIssue('EAS-1')).toMatchObject({ key: 'EAS-1' })
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>
    const methods = calls.map(([, init]) => JSON.parse(init.body as string) as { method: string })
    expect(methods.map(body => body.method)).toEqual(['jira_set_credential', 'jira_get_issue'])
    await fiber.dispose()
  })

  it('registers workspaces and creates prompted worker sessions through connection.api', async () => {
    const { slots, connectionApi, fiber } = await bench()
    const injected = (slots.entries('conversation.view')[0]!.inject as unknown as () => OrgChartInjected)()

    expect(await injected.registerHarnessWorkspace('/tmp')).toEqual({ workspaceId: 'ws-1', path: '/tmp', title: 'tmp' })
    expect(connectionApi.workspace.create).toHaveBeenCalledWith({ path: '/tmp' })

    const launches = await injected.startWorkerSessions({
      id: 'task-1', description: 'x', brief: 'docs', state: 'queued', assignee: 'u-1', jiraKey: 'EAS-1', workspacePaths: ['/tmp'],
    }, 'context')
    expect(launches).toEqual([{ workspacePath: '/tmp', workspaceId: 'ws-1', sessionId: 'session-1', accepted: true }])
    expect(connectionApi.sessions.create).toHaveBeenCalledWith({ workspaceId: 'ws-1' })
    expect(connectionApi.sessions.prompt).toHaveBeenCalledWith(expect.objectContaining({ mode: 'queue' }))
    await fiber.dispose()
  })

  it('reports worker updates to Foreman and subscribes to task events', async () => {
    const { slots, settings, fiber } = await bench()
    settings.publish({ status: 'ready', value: { foremanUrl: 'http://x/rpc', token: 'tok' }, revision: 1, writable: true })
    const injected = (slots.entries('conversation.view')[0]!.inject as unknown as () => OrgChartInjected)()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ result: { context: 'shared' } }) })
      .mockResolvedValueOnce({ json: async () => ({ result: { context: 'shared' } }) })
    globalThis.fetch = fetchMock as never

    expect(await injected.taskReportWorkerUpdate('task-1', '/repo/a', 'A update', 7)).toBe('shared')
    expect(await injected.taskGetSharedContext('task-1')).toBe('shared')

    const close = vi.fn()
    class FakeEventSource {
      static instances: FakeEventSource[] = []
      onmessage: ((event: { data: string }) => void) | null = null
      constructor(url: string) {
        this.url = url
        FakeEventSource.instances.push(this)
      }
      url: string
      close() { close() }
    }
    vi.stubGlobal('EventSource', FakeEventSource)
    const unsubscribe = injected.subscribeTaskEvents('task-1', () => {}, { url: 'http://foreman/rpc', token: 'tok' })
    const inst = FakeEventSource.instances[0]!
    inst.onmessage?.({ data: JSON.stringify({ type: 'worker-update', taskId: 'task-1', workspacePath: '/repo/a', text: 'A', seq: 7, context: 'shared' }) })
    unsubscribe()
    expect(close).toHaveBeenCalled()
    vi.unstubAllGlobals()
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
