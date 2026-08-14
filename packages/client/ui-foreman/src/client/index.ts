/**
 * Browser Foreman panel plugin contributing one entry to the conversation view
 * slot. The org-chart data comes from the Foreman JSON-RPC server through the
 * injected callbacks (the panel is a pure consumer, no host-side service).
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the 'conversation.view' SlotMap row (declared by ui-conversation).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
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

/** Business face injected into the org-chart view component. */
export interface OrgChartInjected {
  /** Foreman JSON-RPC server URL. */
  readonly foremanUrl: string
  /** Fetch the org tree from the Foreman server. */
  readonly listOrg: () => Promise<OrgData>
}

/** Required services: the conversation view slot and the locale service. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the Foreman org-chart view tab. The
 * registration rides the slot service's effect wrapper, so unload removes it.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-foreman: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'foreman',
    order: 20,
    locale: NS,
    label: () => t('view.foreman'),
    inject: (_sessionId: SessionId): OrgChartInjected => {
      const foremanUrl = 'http://127.0.0.1:8787/rpc'
      return {
        foremanUrl,
        listOrg: async () => {
          const res = await fetch(foremanUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'list_org' }),
          })
          const data = (await res.json()) as { result?: OrgData }
          return data.result ?? { nodes: [], memberships: [] }
        },
      }
    },
  }, OrgChartView))
}
