/**
 * Browser Foreman panel plugin contributing one entry to the conversation view
 * slot. The org-chart data comes from the Foreman JSON-RPC server through the
 * injected callbacks. The last-used connection persists in the global
 * `foreman` settings namespace, while each conversation keeps its own
 * connection in a session-scope slot store (see foreman-store.ts).
 */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the 'conversation.view' SlotMap row (declared by ui-conversation).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.settingsScope Context merge (declared by ui-settings).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  DEFAULT_FOREMAN_URL,
  FOREMAN_SETTINGS_NAMESPACE,
  normalizeForemanUrl,
  type ForemanConnection,
  type ForemanSettings,
} from '../foreman-settings.ts'
import { createForemanStore } from './foreman-store.ts'
import { startSharedContextPump, type ContextSyncApi, type SessionEventLike } from './orchestrator.ts'
import { en, NS, zh } from './locales.ts'
import { OrgChartView } from './OrgChartView.tsx'

export type { ForemanConnection } from '../foreman-settings.ts'

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
/** Jira issue creation input embedded in a Foreman task assignment. */
export interface JiraCreateTaskInput {
  readonly projectKey: string
  readonly issueTypeName: string
  readonly summary: string
  readonly description?: string
  readonly priorityName?: string
  readonly componentNames?: readonly string[]
  readonly fixVersionNames?: readonly string[]
}

export interface AssignTaskInput {
  /** Omit to let the server generate the task id. */
  readonly id?: string
  /** Required unless jiraKey is supplied; the server fills it from Jira. */
  readonly description?: string
  /** Detailed brief: free-form instructions, document content, links, or acceptance notes. */
  readonly brief?: string
  readonly changeIntent: 'additive' | 'contract' | 'rewrite'
  /** Omit to assign to the caller (self-assignment). */
  readonly assignee?: string
  /** Link or create-context source Jira issue. */
  readonly jiraKey?: string
  /** Create a Jira issue while dispatching. */
  readonly jira?: JiraCreateTaskInput
  /** Reassign the linked Jira issue to the task assignee. */
  readonly jiraAssign?: boolean
}

/** Identity resolved from a Foreman token. */
export interface UserIdentity {
  readonly userId: string
  readonly name: string
}

/** A task summary shown in the node or personal task list. */
export interface TaskSummary {
  readonly id: string
  readonly description: string
  readonly brief: string
  readonly state: string
  readonly assignee: string | null
  readonly jiraKey?: string | null
  readonly jiraStatus?: string | null
  readonly workspacePaths?: readonly string[]
}

/** Browser-side view of one registered Harness workspace. */
export interface HarnessWorkspaceView {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
}

/** One worker update broadcast through Foreman task events. */
export interface TaskWorkerEvent {
  readonly type: 'worker-update'
  readonly taskId: string
  readonly workspacePath: string
  readonly text: string
  readonly seq: number | null
  readonly context: string
}

/** Result of creating and prompting one per-workspace worker session. */
export interface WorkerLaunchResult {
  readonly workspacePath: string
  readonly workspaceId: string
  readonly sessionId: string
  readonly accepted: boolean
}

/** Normalized Jira issue returned by the Foreman Jira proxy. */
export interface JiraIssueView {
  readonly key: string
  readonly summary: string
  readonly descriptionText: string
  readonly status: string
  readonly statusId: string
  readonly issueType: string
  readonly issueTypeId: string
  readonly subtask: boolean
  readonly parentKey: string | null
  readonly assignee: string | null
  readonly reporter: string | null
  readonly priority: string | null
  readonly components: readonly string[]
  readonly fixVersions: readonly string[]
  readonly attachments: readonly { id: string; filename: string; mimeType: string; url: string }[]
  readonly comments: readonly { author: string; created: string; bodyText: string }[]
  readonly created: string
  readonly updated: string
  readonly url: string
}

export interface JiraTransition {
  readonly id: string
  readonly name: string
  readonly to: string
}

export interface JiraProfile {
  readonly accountId: string
  readonly displayName: string
  readonly emailAddress: string
}

/** Business face injected into the org-chart view component. */
export interface OrgChartInjected {
  /** Read the global last-used Foreman connection. */
  readonly getConnection: () => ForemanConnection
  /** Persist a Foreman connection as the global last-used settings fallback. */
  readonly saveConnection: (connection: ForemanConnection) => Promise<void>
  /** Fetch the org tree from the Foreman server. */
  readonly listOrg: (connection?: ForemanConnection) => Promise<OrgData>
  /** Fetch tasks assigned to the connection's token user. */
  readonly listMyTasks: (connection?: ForemanConnection) => Promise<TaskSummary[]>
  /** Resolve the connection's token to a user identity. */
  readonly whoami: (connection?: ForemanConnection) => Promise<UserIdentity>
  /** Claim a task assigned to the connection's token user. */
  readonly claimTask: (taskId: string, connection?: ForemanConnection) => Promise<void>
  /** Dispatch a task to a member. */
  readonly assignTask: (input: AssignTaskInput, connection?: ForemanConnection) => Promise<void>
  /** List tasks of a node's subtree (leader view). */
  readonly listNodeTasks: (nodeId: string, connection?: ForemanConnection) => Promise<TaskSummary[]>
  /** Reject (fail) a task. */
  readonly rejectTask: (taskId: string, connection?: ForemanConnection) => Promise<void>
  /** Save this Foreman user's Jira credential on the server. */
  readonly jiraSetCredential: (email: string, apiKey: string, connection?: ForemanConnection) => Promise<void>
  /** Validate the saved Jira credential. */
  readonly jiraTestCredential: (connection?: ForemanConnection) => Promise<JiraProfile>
  /** Fetch a normalized Jira issue through the server proxy. */
  readonly jiraGetIssue: (issueKeyOrUrl: string, connection?: ForemanConnection) => Promise<JiraIssueView>
  /** Fetch transitions available to the saved Jira user. */
  readonly jiraGetTransitions: (issueKeyOrUrl: string, connection?: ForemanConnection) => Promise<JiraTransition[]>
  /** Execute a Jira transition. */
  readonly jiraTransition: (issueKeyOrUrl: string, transitionId: string, connection?: ForemanConnection) => Promise<void>
  /** Set the workspace paths stored on a Foreman task. */
  readonly setTaskWorkspaces: (taskId: string, paths: readonly string[], connection?: ForemanConnection) => Promise<TaskSummary>
  /** List workspaces registered in this Harness host. */
  readonly listHarnessWorkspaces: () => Promise<HarnessWorkspaceView[]>
  /** Register (or reuse) a local directory as a Harness workspace. */
  readonly registerHarnessWorkspace: (path: string) => Promise<HarnessWorkspaceView>
  /** Create and prompt one worker session per workspace path. */
  readonly startWorkerSessions: (task: TaskSummary, context: string) => Promise<WorkerLaunchResult[]>
  /** Report a worker's new assistant text to the Foreman shared context. */
  readonly taskReportWorkerUpdate: (
    taskId: string,
    workspacePath: string,
    text: string,
    seq: number | null,
    connection?: ForemanConnection,
  ) => Promise<string>
  /** Read the latest shared context persisted on Foreman. */
  readonly taskGetSharedContext: (taskId: string, connection?: ForemanConnection) => Promise<string>
  /** Subscribe to Foreman task events; returns an unsubscribe function. */
  readonly subscribeTaskEvents: (taskId: string, onEvent: (event: TaskWorkerEvent) => void, connection?: ForemanConnection) => () => void
}

/** Required services: the conversation view slot, the locale service, and settings. */
export const inject = ['slots', 'locale', 'settingsScope', 'connection']

interface HarnessRpcResult<T> {
  readonly ok: true
  readonly value: T
}

interface HarnessRpcError {
  readonly ok: false
  readonly error: { message: string }
}

type HarnessRpcLike<T> = Promise<{ result: HarnessRpcResult<T> | HarnessRpcError }>

/** Structural slice of the browser connection API used by workspace/agent flows. */
interface HarnessConnectionService {
  readonly api: {
    workspace: {
      create(payload: { path: string }):
      HarnessRpcLike<{ workspace: HarnessWorkspaceView; created: boolean }>
      list(payload: Record<string, never>):
      HarnessRpcLike<{ items: HarnessWorkspaceView[] }>
    }
    sessions: {
      create(payload: { workspaceId: string; cwd?: string }):
      HarnessRpcLike<{ sessionId: string }>
      prompt(payload: { sessionId: string; mode: 'queue'; content: Array<{ type: 'text'; text: string }> }):
      HarnessRpcLike<{ accepted: boolean }>
      history(payload: { sessionId: string; maxMessages?: number }):
      HarnessRpcLike<{ events: SessionEventLike[] }>
    }
  }
}

function requireHarnessValue<T>(
  response: { result: HarnessRpcResult<T> | { ok: false; error: { message: string } } },
  operation: string,
): T {
  if (!response.result.ok) throw new Error(`${operation}: ${response.result.error.message}`)
  return response.result.value
}

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
    store: createForemanStore,
    inject: (_sessionId: SessionId): OrgChartInjected => {
      let savedConnection: ForemanConnection | undefined
      const readConnection = (): ForemanConnection => {
        if (savedConnection !== undefined) return savedConnection
        const { foremanUrl = DEFAULT_FOREMAN_URL, token = '' } = settings.getSnapshot().value ?? {}
        let url = DEFAULT_FOREMAN_URL
        try {
          url = normalizeForemanUrl(foremanUrl)
        } catch {
          url = DEFAULT_FOREMAN_URL
        }
        return { url, token }
      }
      const resolveConnection = (connection?: ForemanConnection): ForemanConnection =>
        connection ?? readConnection()
      return {
        getConnection: readConnection,
        saveConnection: async (connection) => {
          const normalized = { url: normalizeForemanUrl(connection.url), token: connection.token }
          await settings.set('foremanUrl', normalized.url)
          await settings.set('token', normalized.token)
          savedConnection = normalized
        },
        listOrg: async (connection) => {
          const { url, token } = resolveConnection(connection)
          const result = await rpc(url, token, 'list_org') as OrgData | undefined
          return result ?? { nodes: [], memberships: [] }
        },
        listMyTasks: async (connection) => {
          const { url, token } = resolveConnection(connection)
          const result = await rpc(url, token, 'list_my_tasks', { token }) as TaskSummary[] | undefined
          return result ?? []
        },
        whoami: async (connection) => {
          const { url, token } = resolveConnection(connection)
          const result = await rpc(url, token, 'whoami', { token }) as UserIdentity | undefined
          if (!result || typeof result.userId !== 'string' || typeof result.name !== 'string') {
            throw new Error('Foreman 服务端未返回当前用户信息')
          }
          return { userId: result.userId, name: result.name }
        },
        claimTask: async (taskId, connection) => {
          const { url, token } = resolveConnection(connection)
          await rpc(url, token, 'claim_my_task', { token, taskId })
        },
        assignTask: async (input, connection) => {
          const { url, token } = resolveConnection(connection)
          await rpc(url, token, 'assign_task', { token, ...input })
        },
        listNodeTasks: async (nodeId, connection) => {
          const { url, token } = resolveConnection(connection)
          const result = await rpc(url, token, 'list_node_tasks', { token, nodeId }) as TaskSummary[] | undefined
          return result ?? []
        },
        rejectTask: async (taskId, connection) => {
          const { url, token } = resolveConnection(connection)
          await rpc(url, token, 'reject_task', { token, taskId })
        },
        jiraSetCredential: async (email, apiKey, connection) => {
          const { url, token } = resolveConnection(connection)
          await rpc(url, token, 'jira_set_credential', { token, email, apiKey })
        },
        jiraTestCredential: async (connection) => {
          const { url, token } = resolveConnection(connection)
          return await rpc(url, token, 'jira_test_credential', { token }) as JiraProfile
        },
        jiraGetIssue: async (issueKeyOrUrl, connection) => {
          const { url, token } = resolveConnection(connection)
          return await rpc(url, token, 'jira_get_issue', { token, issueKeyOrUrl }) as JiraIssueView
        },
        jiraGetTransitions: async (issueKeyOrUrl, connection) => {
          const { url, token } = resolveConnection(connection)
          return await rpc(url, token, 'jira_get_transitions', { token, issueKeyOrUrl }) as JiraTransition[]
        },
        jiraTransition: async (issueKeyOrUrl, transitionId, connection) => {
          const { url, token } = resolveConnection(connection)
          await rpc(url, token, 'jira_transition', { token, issueKeyOrUrl, transitionId })
        },
        setTaskWorkspaces: async (taskId, paths, connection) => {
          const { url, token } = resolveConnection(connection)
          return await rpc(url, token, 'task_set_workspaces', { token, taskId, paths }) as TaskSummary
        },
        listHarnessWorkspaces: async () => {
          const harness = ctx.get('connection') as HarnessConnectionService | undefined
          if (!harness) return []
          const response = await harness.api.workspace.list({})
          return requireHarnessValue(response, 'workspace.list').items
        },
        registerHarnessWorkspace: async (path) => {
          const harness = ctx.get('connection') as HarnessConnectionService | undefined
          if (!harness) throw new Error('当前页面没有 Harness 连接，无法注册工作区')
          const response = await harness.api.workspace.create({ path })
          return requireHarnessValue(response, 'workspace.create').workspace
        },
        taskReportWorkerUpdate: async (taskId, workspacePath, text, seq, connection) => {
          const { url, token } = resolveConnection(connection)
          const result = await rpc(url, token, 'task_report_worker_update', {
            token, taskId, workspacePath, text, ...(seq === null ? {} : { seq }),
          }) as { context: string }
          return result.context
        },
        taskGetSharedContext: async (taskId, connection) => {
          const { url, token } = resolveConnection(connection)
          const result = await rpc(url, token, 'task_get_shared_context', { token, taskId }) as { context: string }
          return result.context
        },
        subscribeTaskEvents: (taskId, onEvent, connection) => {
          const { url, token } = resolveConnection(connection)
          if (typeof EventSource === 'undefined') return () => {}
          const base = url.replace(/\/rpc\/?$/, '')
          const source = new EventSource(`${base}/events?taskId=${encodeURIComponent(taskId)}&token=${encodeURIComponent(token)}`)
          source.onmessage = (message: MessageEvent) => {
            try {
              onEvent(JSON.parse(message.data as string) as TaskWorkerEvent)
            } catch {
              // ignore malformed events
            }
          }
          return () => { source.close() }
        },
        /** Create and prompt one worker session per workspace path. */
        startWorkerSessions: async (task, context) => {
          const harness = ctx.get('connection') as HarnessConnectionService | undefined
          if (!harness) throw new Error('当前页面没有 Harness 连接，无法创建工作会话')
          const paths = task.workspacePaths ?? []
          const results: WorkerLaunchResult[] = []
          for (const path of paths) {
            const workspace = await harness.api.workspace.create({ path })
            const workspaceId = requireHarnessValue(workspace, 'workspace.create').workspace.workspaceId
            const session = await harness.api.sessions.create({ workspaceId })
            const sessionId = requireHarnessValue(session, 'sessions.create').sessionId
            const prompt = `你是任务 ${task.id}（Jira ${task.jiraKey ?? '无'}）的工作 agent。

第一步：先阅读当前工作区代码，输出相关文件、当前分支、关键约束和修改建议。
第二步：根据任务上下文实施修改。

只修改当前工作区：${path}

共享任务上下文：
${context}`
            const accepted = requireHarnessValue(await harness.api.sessions.prompt({ sessionId, mode: 'queue', content: [{ type: 'text', text: prompt }] }), 'sessions.prompt').accepted
            results.push({ workspacePath: path, workspaceId, sessionId, accepted })
          }
          const { url, token } = resolveConnection()
          startSharedContextPump(harness.api as unknown as ContextSyncApi, results, context, {
            onReport: (worker, update) => {
              void rpc(url, token, 'task_report_worker_update', {
                token,
                taskId: task.id,
                workspacePath: worker.workspacePath,
                text: update.text,
                seq: update.seq,
              }).catch(() => {})
            },
          })
          if (typeof EventSource !== 'undefined') {
            const base = url.replace(/\/rpc\/?$/, '')
            const source = new EventSource(`${base}/events?taskId=${encodeURIComponent(task.id)}&token=${encodeURIComponent(token)}`)
            source.onmessage = (message: MessageEvent) => {
              try {
                const event = JSON.parse(message.data as string) as TaskWorkerEvent
                const updatePrompt = `其他工作区有新的进展，请先阅读共享上下文更新：\n\n${event.context}`
                for (const worker of results) {
                  void harness.api.sessions.prompt({
                    sessionId: worker.sessionId,
                    mode: 'queue',
                    content: [{ type: 'text', text: updatePrompt }],
                  }).then((response) => {
                    if (!response.result.ok) throw new Error(response.result.error.message)
                  }).catch(() => {})
                }
              } catch {
                // ignore malformed events
              }
            }
          }
          return results
        },
      }
    },
  }, OrgChartView))
}
