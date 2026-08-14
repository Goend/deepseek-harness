/** Foreman org-chart view: renders the org tree from the injected data source. */

import { useEffect, useState } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { buildOrgTree, rootNodes } from './org-tree.ts'
import type { OrgChartInjected, OrgData, OrgNodeData } from './index.ts'
import css from './OrgChartView.module.css'

const EMPTY_ORG: OrgData = { nodes: [], memberships: [] }

/** One org-tree node rendered with its indented children. */
function OrgTreeNode({ node, tree, depth }: { node: OrgNodeData; tree: Map<string | null, OrgNodeData[]>; depth: number }) {
  const children = tree.get(node.id) ?? []
  return (
    <div>
      <div className={css.node} style={{ paddingLeft: depth * 16 }}>
        <span>{node.name}</span>
        {node.leaderId ? <span className={css.leader}>leader: {node.leaderId}</span> : null}
        {node.domain ? <span className={css.domain}>— {node.domain}</span> : null}
      </div>
      {children.map(child => (
        <OrgTreeNode key={child.id} node={child} tree={tree} depth={depth + 1} />
      ))}
    </div>
  )
}

/** The org-chart view tab body. */
export function OrgChartView({ foremanUrl, listOrg }: ConvViewProps & InjectFace<OrgChartInjected> & PropsLocale<'foreman'>) {
  const [org, setOrg] = useState<OrgData>(EMPTY_ORG)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    void listOrg()
      .then((data) => { if (alive) setOrg(data) })
      .catch(() => { if (alive) setOrg(EMPTY_ORG) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [listOrg])

  const tree = buildOrgTree(org.nodes)

  return (
    <div className={css.root}>
      <h2 className={css.heading}>组织架构</h2>
      {loading ? (
        <p className={css.empty}>加载中…</p>
      ) : org.nodes.length === 0 ? (
        <p className={css.empty}>未连接到 Foreman 服务端（{foremanUrl}）</p>
      ) : (
        rootNodes(org.nodes).map(node => (
          <OrgTreeNode key={node.id} node={node} tree={tree} depth={0} />
        ))
      )}
    </div>
  )
}
