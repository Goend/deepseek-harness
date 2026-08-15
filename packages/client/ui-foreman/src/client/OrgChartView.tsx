/** Foreman org-chart view: connection config, org tree, members, tasks, dispatch. */

import { useEffect, useState } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { buildOrgTree, rootNodes } from './org-tree.ts'
import type { OrgChartInjected, OrgData, OrgNodeData, TaskSummary } from './index.ts'
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
        <button className={css.smallButton} onClick={() => onViewTasks(node.id)}>任务</button>
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

/** The org-chart view tab body. */
export function OrgChartView({ getConnection, saveConnection, listOrg, assignTask, listNodeTasks, rejectTask }: ConvViewProps & InjectFace<OrgChartInjected> & PropsLocale<'foreman'>) {
  const initial = getConnection()
  const [org, setOrg] = useState<OrgData>(EMPTY_ORG)
  const [loading, setLoading] = useState(true)
  const [configOpen, setConfigOpen] = useState(false)
  const [urlInput, setUrlInput] = useState(initial.url)
  const [tokenInput, setTokenInput] = useState(initial.token)
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState('')
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [nodeTasks, setNodeTasks] = useState<TaskSummary[]>([])

  async function reload(): Promise<void> {
    setLoading(true)
    setLoadError(null)
    try {
      setOrg(await listOrg())
    } catch (e) {
      setOrg(EMPTY_ORG)
      setLoadError(errorText(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    setLoadError(null)
    void listOrg()
      .then((data) => { if (alive) setOrg(data) })
      .catch((e: unknown) => { if (alive) { setOrg(EMPTY_ORG); setLoadError(errorText(e)) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [listOrg])

  const tree = buildOrgTree(org.nodes)
  const members = membersByNode(org)
  const allMembers = [...new Set(org.memberships.map(m => m.userId))]

  async function handleSaveConnection(): Promise<void> {
    setMessage('')
    try {
      await saveConnection(urlInput, tokenInput)
      setConfigOpen(false)
      await reload()
    } catch (e) {
      setMessage(errorText(e))
    }
  }

  async function handleViewTasks(nodeId: string): Promise<void> {
    setMessage('')
    setSelectedNode(nodeId)
    try {
      setNodeTasks(await listNodeTasks(nodeId))
    } catch (e) {
      setNodeTasks([])
      setMessage(errorText(e))
    }
  }

  async function handleReject(taskId: string): Promise<void> {
    setMessage('')
    try {
      await rejectTask(taskId)
      /* v8 ignore next -- the task panel only renders when selectedNode is set */
      if (selectedNode) setNodeTasks(await listNodeTasks(selectedNode))
    } catch (e) {
      setMessage(errorText(e))
    }
  }

  async function handleAssign(): Promise<void> {
    /* v8 ignore next -- the submit button is disabled until a description is set */
    if (!description) return
    setMessage('')
    try {
      await assignTask({ description, changeIntent: 'additive', ...(assignee ? { assignee } : {}) })
      setMessage('已下发任务')
      setDescription('')
    } catch (e) {
      setMessage(errorText(e))
    }
  }

  return (
    <div className={css.root}>
      <div className={css.headingRow}>
        <h2 className={css.heading}>组织架构</h2>
        <button className={css.button} onClick={() => setConfigOpen(v => !v)}>
          {configOpen ? '收起配置' : '连接配置'}
        </button>
      </div>

      {configOpen ? (
        <form
          className={css.form}
          onSubmit={(e) => { e.preventDefault(); void handleSaveConnection() }}
        >
          <input
            className={css.input}
            value={urlInput}
            placeholder="服务器地址（http://host:8787/rpc）"
            onChange={e => setUrlInput(e.target.value)}
          />
          <input
            className={css.input}
            value={tokenInput}
            placeholder="token（可空）"
            onChange={e => setTokenInput(e.target.value)}
          />
          <button type="submit" className={css.button}>保存并连接</button>
        </form>
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
            <OrgTreeNode key={node.id} node={node} tree={tree} members={members} depth={0} onViewTasks={handleViewTasks} />
          ))}

          {selectedNode ? (
            <div className={css.taskPanel}>
              <h3 className={css.taskHeading}>节点任务（{selectedNode}）</h3>
              {nodeTasks.length === 0 ? (
                <p className={css.empty}>无任务</p>
              ) : (
                nodeTasks.map(t => (
                  <div key={t.id} className={css.taskRow}>
                    <span>{t.id} — {t.description}（{t.state}）</span>
                    <button className={css.smallButton} onClick={() => void handleReject(t.id)}>驳回</button>
                  </div>
                ))
              )}
            </div>
          ) : null}

          <form
            className={css.form}
            onSubmit={(e) => { e.preventDefault(); void handleAssign() }}
          >
            <input
              className={css.input}
              value={description}
              placeholder="任务描述"
              onChange={e => setDescription(e.target.value)}
            />
            <select
              className={css.input}
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
            >
              <option value="">（给自己）</option>
              {allMembers.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button type="submit" className={css.button} disabled={!description}>
              下发任务
            </button>
          </form>
        </>
      )}
      {message ? <p className={css.message}>{message}</p> : null}
    </div>
  )
}
