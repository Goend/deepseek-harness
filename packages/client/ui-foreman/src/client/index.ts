/**
 * Browser Foreman panel plugin contributing one entry to the conversation view
 * slot. The org-chart data comes from the Foreman JSON-RPC server through the
 * injected callbacks; the server URL and auth token read from the `foreman`
 * settings namespace (registered by the node-half).
 */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the 'conversation.view' SlotMap row (declared by ui-conversation).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.settingsScope Context merge (declared by ui-settings).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { FOREMAN_SETTINGS_NAMESPACE, type ForemanSettings } from '../foreman-settings.ts'
import { en, NS, zh } from './locales.ts'
import { OrgChartView } from './OrgChartView.tsx'

/** One org-tree node as returned by the Foreman server. */
export interface OrgNodeData {
  readonly id: string
  readonly name: string
  readonly parentId: string | null
  readonly leaderId: string | null
  readonly domain: string | null
}

/** The org snapshot returned by `list_org`. */
export interface OrgData {
  readonly nodes: readonly OrgNodeData[]
  readonly memberships: readonly { readonly userId: string; readonly nodeId: string }[]
}

/** A task dispatch issued from the panel. */
export interface AssignTaskInput {
  readonly id: string
  readonly description: string
  readonly changeIntent: 'additive' | 'contract' | 'rewrite'
  readonly assignee: string
}

/** Business face injected into the org-chart view component. */
export interface OrgChartInjected {
  /** Foreman JSON-RPC server URL. */
  readonly foremanUrl: string
  /** Fetch the org tree from the Foreman server. */
  readonly listOrg: () => Promise<OrgData>
  /** Dispatch a task to a member. */
  readonly assignTask: (input: AssignTaskInput) => Promise<void>
}

/** Required services: the conversation view slot, the locale service, and settings. */
export const inject = ['slots', 'locale', 'settingsScope']

const DEFAULT_URL = 'http://127.0.0.1:8787/rpc'

/** Minimal JSON-RPC call to the Foreman server. */
async function rpc(url: string, token: string, method: string, params?: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params === undefined ? {} : { params }) }),
  })
  const data = (await res.json()) as { result?: unknown; error?: { message: string } }
  if (data.error) throw new Error(data.error.message)
  return data.result
}

/**
 * Client plugin body: register the Foreman org-chart view tab. The
 * registration rides the slot service's effect wrapper, so unload removes it.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-foreman: dictionaries')
  const t = ctx.locale.bind(NS)
  const settings = ctx.settingsScope.bind<ForemanSettings>({ namespace: FOREMAN_SETTINGS_NAMESPACE })
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'foreman',
    order: 20,
    locale: NS,
    label: () => t('view.foreman'),
    inject: (_sessionId: SessionId): OrgChartInjected => {
      const { foremanUrl = DEFAULT_URL, token = '' } = settings.getSnapshot().value ?? {}
      return {
        foremanUrl,
        listOrg: async () => {
          const result = await rpc(foremanUrl, token, 'list_org') as OrgData | undefined
          return result ?? { nodes: [], memberships: [] }
        },
        assignTask: async (input) => {
          await rpc(foremanUrl, token, 'assign_task', { token, ...input })
        },
      }
    },
  }, OrgChartView))
}
