/** Foreman org-chart view: per-conversation connection, org tree, my tasks, dispatch. */

import { useEffect, useState } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { normalizeForemanUrl, type ForemanConnection } from '../foreman-settings.ts'
import { createForemanStore } from './foreman-store.ts'
import { buildOrgTree, rootNodes } from './org-tree.ts'
import type {
  AssignTaskInput,
  JiraCreateTaskInput,
  JiraIssueView,
  JiraProfile,
  JiraTransition,
  OrgChartInjected,
  OrgData,
  OrgNodeData,
  TaskSummary,
  UserIdentity,
} from './index.ts'
import css from './OrgChartView.module.css'

const EMPTY_ORG: OrgData = { nodes: [], memberships: [] }

/** Render any thrown value as a human-readable message. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** User ids grouped by node id. */
function membersByNode(org: OrgData): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const m of org.memberships) {
    const list = map.get(m.nodeId) ?? []
    list.push(m.userId)
    map.set(m.nodeId, list)
  }
  return map
}

/** One org-tree node rendered with its members, tasks button, and indented children. */
function OrgTreeNode({
  node, tree, members, depth, onViewTasks,
}: {
  node: OrgNodeData
  tree: Map<string | null, OrgNodeData[]>
  members: Map<string, string[]>
  depth: number
  onViewTasks: (nodeId: string) => void
}) {
  const children = tree.get(node.id) ?? []
  const nodeMembers = members.get(node.id) ?? []
  return (
    <div>
      <div className={css.node} style={{ paddingLeft: depth * 16 }}>
        <span>{node.name}</span>
        {node.leaderId ? <span className={css.leader}>leader: {node.leaderId}</span> : null}
        {node.domain ? <span className={css.domain}>— {node.domain}</span> : null}
        <button className={css.smallButton} onClick={() => { onViewTasks(node.id) }}>任务</button>
      </div>
      {nodeMembers.length > 0 ? (
        <div className={css.members} style={{ paddingLeft: depth * 16 + 16 }}>
          成员: {nodeMembers.join(', ')}
        </div>
      ) : null}
      {children.map(child => (
        <OrgTreeNode key={child.id} node={child} tree={tree} members={members} depth={depth + 1} onViewTasks={onViewTasks} />
      ))}
    </div>
  )
}

function JiraPanel({
  connection,
  setCredential,
  testCredential,
  getIssue,
  getTransitions,
  transition,
}: {
  connection: ForemanConnection
  setCredential: OrgChartInjected['jiraSetCredential']
  testCredential: OrgChartInjected['jiraTestCredential']
  getIssue: OrgChartInjected['jiraGetIssue']
  getTransitions: OrgChartInjected['jiraGetTransitions']
  transition: OrgChartInjected['jiraTransition']
}) {
  const [email, setEmail] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [profile, setProfile] = useState<JiraProfile | null>(null)
  const [credentialMessage, setCredentialMessage] = useState('')
  const [issueInput, setIssueInput] = useState('')
  const [issue, setIssue] = useState<JiraIssueView | null>(null)
  const [transitions, setTransitions] = useState<JiraTransition[]>([])
  const [issueError, setIssueError] = useState('')

  async function handleSaveCredential(): Promise<void> {
    setCredentialMessage('')
    try {
      await setCredential(email, apiKey, connection)
      setProfile(await testCredential(connection))
      setCredentialMessage('Jira 凭据已保存并验证通过')
    } catch (e) {
      setCredentialMessage(errorText(e))
    }
  }

  async function handleLookupIssue(): Promise<void> {
    setIssueError('')
    setIssue(null)
    setTransitions([])
    try {
      setIssue(await getIssue(issueInput, connection))
      setTransitions(await getTransitions(issueInput, connection))
    } catch (e) {
      setIssueError(errorText(e))
    }
  }

  async function handleTransition(id: string): Promise<void> {
    if (!issue) return
    setIssueError('')
    try {
      await transition(issue.key, id, connection)
      setIssue(await getIssue(issue.key, connection))
      setTransitions(await getTransitions(issue.key, connection))
    } catch (e) {
      setIssueError(errorText(e))
    }
  }

  return (
    <div className={css.jira}>
      <div className={css.taskPanel}>
        <h3 className={css.taskHeading}>Jira 凭据</h3>
        <form className={css.form} onSubmit={(e) => { e.preventDefault(); void handleSaveCredential() }}>
          <input className={css.input} value={email} placeholder="Jira 邮箱" onChange={(e) => { setEmail(e.target.value) }} />
          <input className={css.input} value={apiKey} type="password" placeholder="Jira API key" onChange={(e) => { setApiKey(e.target.value) }} />
          <button type="submit" className={css.button}>保存并验证</button>
        </form>
        {profile ? <p className={css.identity}>Jira 用户：{profile.displayName}（{profile.emailAddress}）</p> : null}
        {credentialMessage ? <p className={css.message}>{credentialMessage}</p> : null}
      </div>

      <div className={css.taskPanel}>
        <h3 className={css.taskHeading}>Jira Issue</h3>
        <form className={css.form} onSubmit={(e) => { e.preventDefault(); void handleLookupIssue() }}>
          <input className={css.input} value={issueInput} placeholder="EAS-145045 或 Jira URL" onChange={(e) => { setIssueInput(e.target.value) }} />
          <button type="submit" className={css.button}>查询</button>
        </form>
        {issueError ? <p className={css.message}>{issueError}</p> : null}
        {issue ? (
          <div className={css.issue}>
            <div className={css.taskHeadingRow}>
              <h4 className={css.issueTitle}><a href={issue.url} target="_blank" rel="noreferrer">{issue.key}</a> {issue.summary}</h4>
              <span className={css.issueStatus}>{issue.status}</span>
            </div>
            <p className={css.issueMeta}>{issue.issueType} · {issue.priority ?? '无优先级'} · {issue.assignee ?? '未分配'}</p>
            {issue.descriptionText ? <p className={css.taskBrief}>{issue.descriptionText}</p> : null}
            {issue.components.length > 0 ? <p className={css.issueMeta}>组件：{issue.components.join(', ')}</p> : null}
            {issue.fixVersions.length > 0 ? <p className={css.issueMeta}>Fix Version：{issue.fixVersions.join(', ')}</p> : null}
            {issue.attachments.length > 0 ? (
              <div className={css.attachments}>
                {issue.attachments.map(a => <a key={a.id} className={css.jiraLink} href={a.url} target="_blank" rel="noreferrer">{a.filename}</a>)}
              </div>
            ) : null}
            {transitions.length > 0 ? (
              <div className={css.transitions}>
                {transitions.map(t => (
                  <button key={t.id} className={css.smallButton} onClick={() => { void handleTransition(t.id) }}>
                    {t.name} → {t.to}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function TaskList({
  tasks,
  emptyText,
  onClaim,
  onReject,
  onSetWorkspaces,
  onCopyContext,
  onStartWorkers,
}: {
  tasks: readonly TaskSummary[]
  emptyText: string
  onClaim?: (taskId: string) => void
  onReject?: (taskId: string) => void
  onSetWorkspaces?: (task: TaskSummary, paths: readonly string[]) => void
  onCopyContext?: (task: TaskSummary) => void
  onStartWorkers?: (task: TaskSummary) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [newPath, setNewPath] = useState('')
  if (tasks.length === 0) return <p className={css.empty}>{emptyText}</p>
  return (
    <div className={css.taskList}>
      {tasks.map((task) => {
        const expanded = expandedId === task.id
        return (
          <div key={task.id} className={css.taskItem}>
            <div className={css.taskSummaryRow}>
              <button
                type="button"
                className={css.taskSummary}
                aria-expanded={expanded}
                onClick={() => { setExpandedId(expanded ? null : task.id) }}
              >
                <span className={css.taskSummaryToggle}>{expanded ? '▾' : '▸'}</span>
                <span>{task.id} — {task.description}（{task.state}）</span>
              </button>
              {task.jiraKey ? <a className={css.jiraLink} href={`https://easystack.atlassian.net/browse/${task.jiraKey}`} target="_blank" rel="noreferrer">{task.jiraKey}</a> : null}
            </div>
            {expanded ? (
              <div className={css.taskDetails}>
                {task.brief ? <p className={css.taskBrief}>{task.brief}</p> : <p className={css.taskBrief}>无附加说明</p>}
                <div className={css.workspaces}>
                  <span className={css.workspacesLabel}>工作区：</span>
                  {(task.workspacePaths ?? []).map(path => (
                    <span key={path} className={css.workspaceChip}>
                      {path}
                      {onSetWorkspaces ? (
                        <button
                          type="button"
                          className={css.workspaceRemove}
                          aria-label={`移除工作区 ${path}`}
                          onClick={() => { onSetWorkspaces(task, (task.workspacePaths ?? []).filter(p => p !== path)) }}
                        >
                          ×
                        </button>
                      ) : null}
                    </span>
                  ))}
                  {onSetWorkspaces ? (
                    <span className={css.workspaceAdd}>
                      <input
                        className={css.input}
                        value={newPath}
                        placeholder="本地工作区路径"
                        onChange={(e) => { setNewPath(e.target.value) }}
                      />
                      <button
                        type="button"
                        className={css.smallButton}
                        onClick={() => {
                          const path = newPath.trim()
                          if (!path) return
                          onSetWorkspaces(task, [...(task.workspacePaths ?? []), path])
                          setNewPath('')
                        }}
                      >
                        添加
                      </button>
                    </span>
                  ) : null}
                </div>
                <div className={css.taskActions}>
                  {onCopyContext ? <button className={css.smallButton} onClick={() => { onCopyContext(task) }}>复制上下文</button> : null}
                  {onStartWorkers ? <button className={css.smallButton} onClick={() => { onStartWorkers(task) }}>启动工作会话</button> : null}
                  {onClaim && task.state === 'queued' ? (
                    <button className={css.smallButton} onClick={() => { onClaim(task.id) }}>认领</button>
                  ) : null}
                  {onReject ? (
                    <button className={css.smallButton} onClick={() => { onReject(task.id) }}>驳回</button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

type ForemanViewProps =
  & ConvViewProps
  & PropsStore<ReturnType<typeof createForemanStore>>
  & InjectFace<OrgChartInjected>
  & PropsLocale<'foreman'>

/** The org-chart view tab body. */
export function OrgChartView({
  useStore,
  actions,
  getConnection,
  saveConnection,
  listOrg,
  listMyTasks,
  whoami,
  claimTask,
  assignTask,
  listNodeTasks,
  rejectTask,
  jiraSetCredential,
  jiraTestCredential,
  jiraGetIssue,
  jiraGetTransitions,
  jiraTransition,
  setTaskWorkspaces,
  registerHarnessWorkspace,
  startWorkerSessions,
}: ForemanViewProps) {
  const storedConnection = useStore(s => s.connection)
  const seeded = useStore(s => s.seeded)
  const connection = seeded ? storedConnection : getConnection()
  const [org, setOrg] = useState<OrgData>(EMPTY_ORG)
  const [myTasks, setMyTasks] = useState<TaskSummary[]>([])
  const [me, setMe] = useState<UserIdentity | null>(null)
  const [loading, setLoading] = useState(true)
  const [identityLoading, setIdentityLoading] = useState(true)
  const [myTasksError, setMyTasksError] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [urlInput, setUrlInput] = useState(connection.url)
  const [tokenInput, setTokenInput] = useState(connection.token)
  const [taskId, setTaskId] = useState('')
  const [description, setDescription] = useState('')
  const [brief, setBrief] = useState('')
  const [jiraKeyInput, setJiraKeyInput] = useState('')
  const [createJira, setCreateJira] = useState(false)
  const [jiraProject, setJiraProject] = useState('EAS')
  const [jiraType, setJiraType] = useState('Story')
  const [jiraPriority, setJiraPriority] = useState('')
  const [jiraComponents, setJiraComponents] = useState('')
  const [jiraFixVersions, setJiraFixVersions] = useState('')
  const [view, setView] = useState<'org' | 'jira'>('org')
  const [assignee, setAssignee] = useState('')
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [nodeTasks, setNodeTasks] = useState<TaskSummary[]>([])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setLoadError(null)
    void listOrg(connection)
      .then((data) => { if (alive) setOrg(data) })
      .catch((e: unknown) => { if (alive) { setOrg(EMPTY_ORG); setLoadError(errorText(e)) } })
      .finally(() => { if (alive) setLoading(false) })

    setMyTasksError(null)
    if (connection.token === '') {
      setMyTasks([])
      setMe(null)
      setIdentityLoading(false)
    } else {
      setIdentityLoading(true)
      void listMyTasks(connection)
        .then((tasks) => { if (alive) setMyTasks(tasks) })
        .catch((e: unknown) => { if (alive) { setMyTasks([]); setMyTasksError(errorText(e)) } })

      void whoami(connection)
        .then((identity) => { if (alive) setMe(identity) })
        .catch(() => { if (alive) setMe(null) })
        .finally(() => { if (alive) setIdentityLoading(false) })
    }
    return () => { alive = false }
  }, [listOrg, listMyTasks, whoami, connection.url, connection.token])

  const tree = buildOrgTree(org.nodes)
  const members = membersByNode(org)
  const allMembers = [...new Set(org.memberships.map(m => m.userId))]

  async function refreshMyTasks(): Promise<void> {
    setMyTasksError(null)
    try {
      setMyTasks(await listMyTasks(connection))
    } catch (e) {
      setMyTasks([])
      setMyTasksError(errorText(e))
    }
  }

  async function handleSaveConnection(): Promise<void> {
    setMessage('')
    try {
      const next: ForemanConnection = { url: normalizeForemanUrl(urlInput), token: tokenInput }
      await saveConnection(next)
      actions.setConnection(next)
      setConfigOpen(false)
    } catch (e) {
      setMessage(errorText(e))
    }
  }

  async function handleViewTasks(nodeId: string): Promise<void> {
    setMessage('')
    setSelectedNode(nodeId)
    try {
      setNodeTasks(await listNodeTasks(nodeId, connection))
    } catch (e) {
      setNodeTasks([])
      setMessage(errorText(e))
    }
  }

  async function handleReject(taskId: string): Promise<void> {
    setMessage('')
    try {
      await rejectTask(taskId, connection)
      /* v8 ignore next -- the task panel only renders when selectedNode is set */
      if (selectedNode) setNodeTasks(await listNodeTasks(selectedNode, connection))
    } catch (e) {
      setMessage(errorText(e))
    }
  }

  async function handleClaim(taskId: string): Promise<void> {
    setMessage('')
    try {
      await claimTask(taskId, connection)
      await refreshMyTasks()
    } catch (e) {
      setMessage(errorText(e))
    }
  }

  function taskContext(task: TaskSummary): string {
    const jira = task.jiraKey ? `Jira: ${task.jiraKey}${task.jiraStatus ? `（${task.jiraStatus}）` : ''}` : 'Jira: 未关联'
    const workspaces = (task.workspacePaths ?? []).join('\n  - ') || '未设置'
    return [
      `Foreman 任务：${task.id}`,
      `标题：${task.description}`,
      task.brief ? `详细说明：\n${task.brief}` : '',
      jira,
      `工作区：\n  - ${workspaces}`,
    ].filter(Boolean).join('\n')
  }

  function replaceTask(task: TaskSummary): void {
    setMyTasks(prev => prev.map(t => t.id === task.id ? task : t))
    setNodeTasks(prev => prev.map(t => t.id === task.id ? task : t))
  }

  async function handleSetWorkspaces(task: TaskSummary, paths: readonly string[]): Promise<void> {
    setMessage('')
    try {
      for (const path of paths) {
        try {
          await registerHarnessWorkspace(path)
        } catch {
          // The Foreman record still stores the path; registration errors surface on session start.
        }
      }
      const updated = await setTaskWorkspaces(task.id, paths, connection)
      replaceTask(updated)
      setMessage(`已更新 ${task.id} 的工作区`)
    } catch (e) {
      setMessage(errorText(e))
    }
  }

  async function handleCopyContext(task: TaskSummary): Promise<void> {
    try {
      await navigator.clipboard.writeText(taskContext(task))
      setMessage('任务上下文已复制到剪贴板')
    } catch {
      setMessage('复制失败，请手动选择任务详情复制')
    }
  }

  async function handleStartWorkers(task: TaskSummary): Promise<void> {
    setMessage('')
    try {
      const results = await startWorkerSessions(task, taskContext(task))
      setMessage(`已创建 ${results.length} 个工作会话`)
    } catch (e) {
      setMessage(errorText(e))
    }
  }

  async function handleAssign(): Promise<void> {
    /* v8 ignore next -- the submit button is disabled until required fields are set */
    if (!taskId || (!description && !jiraKeyInput)) return
    setMessage('')
    try {
      const jiraCreate: JiraCreateTaskInput | undefined = createJira ? {
        projectKey: jiraProject,
        issueTypeName: jiraType,
        summary: description || `Task ${taskId}`,
        ...(brief === '' ? {} : { description: brief }),
        ...(jiraPriority === '' ? {} : { priorityName: jiraPriority }),
        ...(jiraComponents.trim() === '' ? {} : { componentNames: jiraComponents.split(',').map(v => v.trim()).filter(Boolean) }),
        ...(jiraFixVersions.trim() === '' ? {} : { fixVersionNames: jiraFixVersions.split(',').map(v => v.trim()).filter(Boolean) }),
      } : undefined
      const input: AssignTaskInput = {
        id: taskId,
        ...(description ? { description } : {}),
        ...(brief === '' ? {} : { brief }),
        ...(jiraKeyInput === '' ? {} : { jiraKey: jiraKeyInput }),
        ...(jiraCreate ? { jira: jiraCreate } : {}),
        ...(jiraKeyInput !== '' && assignee !== '' ? { jiraAssign: true } : {}),
        changeIntent: 'additive',
        ...(assignee ? { assignee } : {}),
      }
      await assignTask(input, connection)
      setMessage(`已下发 ${taskId}`)
      setTaskId('')
      setDescription('')
      setBrief('')
      setJiraKeyInput('')
      setCreateJira(false)
      setJiraComponents('')
      setJiraFixVersions('')
    } catch (e) {
      setMessage(errorText(e))
    }
  }

  return (
    <div className={css.root}>
      <div className={css.headingRow}>
        <h2 className={css.heading}>组织架构</h2>
        <button className={css.button} onClick={() => { setConfigOpen(v => !v) }}>
          {configOpen ? '收起配置' : '连接配置'}
        </button>
      </div>

      <div className={css.subTabs} role="tablist">
        <button type="button" role="tab" aria-selected={view === 'org'} className={view === 'org' ? css.subTabActive : css.subTab} onClick={() => { setView('org') }}>组织</button>
        <button type="button" role="tab" aria-selected={view === 'jira'} className={view === 'jira' ? css.subTabActive : css.subTab} onClick={() => { setView('jira') }}>Jira</button>
      </div>

      {view === 'jira' ? (
        <JiraPanel
          connection={connection}
          setCredential={jiraSetCredential}
          testCredential={jiraTestCredential}
          getIssue={jiraGetIssue}
          getTransitions={jiraGetTransitions}
          transition={jiraTransition}
        />
      ) : (
        <>
          {me ? <p className={css.identity}>当前用户：{me.name}（{me.userId}）</p> : null}

          {configOpen ? (
            <form
              className={css.form}
              onSubmit={(e) => { e.preventDefault(); void handleSaveConnection() }}
            >
              <input
                className={css.input}
                value={urlInput}
                placeholder="服务器地址（http://host:8787/rpc）"
                onChange={(e) => { setUrlInput(e.target.value) }}
              />
              <input
                className={css.input}
                value={tokenInput}
                placeholder="token（每个对话可不同）"
                onChange={(e) => { setTokenInput(e.target.value) }}
              />
              <button type="submit" className={css.button}>保存并连接</button>
            </form>
          ) : null}

          {org.nodes.length > 0 && me === null && !loading && !identityLoading ? (
            <p className={css.connectionHint}>
              {connection.token === ''
                ? '当前未设置 token，仅可浏览组织架构；点「连接配置」填写 token 后即可查看我的任务。'
                : '当前 token 未通过认证；请点「连接配置」检查服务器地址和 token。'}
            </p>
          ) : null}

          {loading ? (
            <p className={css.empty}>加载中…</p>
          ) : org.nodes.length === 0 ? (
            <p className={css.empty}>
              {loadError
                ? `未连接到 Foreman 服务端：${loadError}，请点「连接配置」检查服务器地址和 token`
                : '未连接到 Foreman 服务端，请点「连接配置」设置服务器地址'}
            </p>
          ) : (
            <>
              {rootNodes(org.nodes).map(node => (
                <OrgTreeNode
                  key={node.id}
                  node={node}
                  tree={tree}
                  members={members}
                  depth={0}
                  onViewTasks={(nodeId) => { void handleViewTasks(nodeId) }}
                />
              ))}

              {selectedNode ? (
                <div className={css.taskPanel}>
                  <h3 className={css.taskHeading}>节点任务（{selectedNode}）</h3>
                  <TaskList
                    tasks={nodeTasks}
                    emptyText="无任务"
                    onReject={(taskId) => { void handleReject(taskId) }}
                    onSetWorkspaces={(task, paths) => { void handleSetWorkspaces(task, paths) }}
                    onCopyContext={(task) => { void handleCopyContext(task) }}
                    onStartWorkers={(task) => { void handleStartWorkers(task) }}
                  />
                </div>
              ) : null}

              {me ? (
                <div className={css.taskPanel}>
                  <div className={css.taskHeadingRow}>
                    <h3 className={css.taskHeading}>我的任务（{me.name}）</h3>
                    <button className={css.smallButton} onClick={() => void refreshMyTasks()}>刷新</button>
                  </div>
                  {myTasksError ? (
                    <p className={css.empty}>无法获取我的任务：{myTasksError}</p>
                  ) : (
                    <TaskList
                      tasks={myTasks}
                      emptyText="暂无分配给我的任务"
                      onClaim={(taskId) => { void handleClaim(taskId) }}
                      onSetWorkspaces={(task, paths) => { void handleSetWorkspaces(task, paths) }}
                      onCopyContext={(task) => { void handleCopyContext(task) }}
                      onStartWorkers={(task) => { void handleStartWorkers(task) }}
                    />
                  )}
                </div>
              ) : null}

              <form
                className={css.form}
                onSubmit={(e) => { e.preventDefault(); void handleAssign() }}
              >
                <input
                  className={css.input}
                  value={taskId}
                  placeholder="任务 id"
                  onChange={(e) => { setTaskId(e.target.value) }}
                />
                <input
                  className={css.input}
                  value={description}
                  placeholder="任务描述"
                  onChange={(e) => { setDescription(e.target.value) }}
                />
                <textarea
                  className={css.textarea}
                  value={brief}
                  placeholder="任务详情 / 文档内容 / 链接等附加信息（可空）"
                  onChange={(e) => { setBrief(e.target.value) }}
                />
                <input
                  className={css.input}
                  value={jiraKeyInput}
                  placeholder="Jira key（可选，填写后由服务端拉取上下文）"
                  onChange={(e) => { setJiraKeyInput(e.target.value) }}
                />
                <label className={css.checkbox}>
                  <input type="checkbox" checked={createJira} onChange={(e) => { setCreateJira(e.target.checked) }} />
                  创建 Jira 并分配给任务成员
                </label>
                {createJira ? (
                  <div className={css.jiraCreateFields}>
                    <input className={css.input} value={jiraProject} placeholder="Jira 项目 key" onChange={(e) => { setJiraProject(e.target.value) }} />
                    <select className={css.input} value={jiraType} onChange={(e) => { setJiraType(e.target.value) }}>
                      <option value="Story">Story</option>
                      <option value="Bug">Bug</option>
                      <option value="Defect">Defect</option>
                      <option value="Epic">Epic</option>
                    </select>
                    <select className={css.input} value={jiraPriority} onChange={(e) => { setJiraPriority(e.target.value) }}>
                      <option value="">默认优先级</option>
                      <option value="Blocker">Blocker</option>
                      <option value="Critical">Critical</option>
                      <option value="Major">Major</option>
                      <option value="Minor">Minor</option>
                      <option value="Trivial">Trivial</option>
                    </select>
                    <input className={css.input} value={jiraComponents} placeholder="组件，逗号分隔（可空）" onChange={(e) => { setJiraComponents(e.target.value) }} />
                    <input className={css.input} value={jiraFixVersions} placeholder="Fix versions，逗号分隔（可空）" onChange={(e) => { setJiraFixVersions(e.target.value) }} />
                  </div>
                ) : null}
                <select
                  className={css.input}
                  value={assignee}
                  onChange={(e) => { setAssignee(e.target.value) }}
                >
                  <option value="">（给自己）</option>
                  {allMembers.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <button type="submit" className={css.button} disabled={!taskId || (!description && !jiraKeyInput)}>
                  下发任务
                </button>
              </form>
            </>
          )}
          {message ? <p className={css.message}>{message}</p> : null}
        </>
      )}
    </div>
  )
}
