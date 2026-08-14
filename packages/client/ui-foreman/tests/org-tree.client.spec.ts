import { describe, expect, it } from 'vitest'
import { buildOrgTree, rootNodes } from '../src/client/org-tree.ts'
import type { OrgNodeData } from '../src/client/index.ts'

const NODES: readonly OrgNodeData[] = [
  { id: 'org', name: 'company', parentId: null, leaderId: null, domain: null },
  { id: 'frontend', name: '前端', parentId: 'org', leaderId: 'alice', domain: 'core/frontend' },
  { id: 'backend', name: '后端', parentId: 'org', leaderId: null, domain: 'core/backend' },
  { id: 'ui', name: 'UI', parentId: 'frontend', leaderId: null, domain: 'core/frontend/ui' },
]

describe('buildOrgTree', () => {
  it('groups children by parent id', () => {
    const tree = buildOrgTree(NODES)
    expect(tree.get('org')!.map(n => n.id)).toEqual(['frontend', 'backend'])
    expect(tree.get('frontend')!.map(n => n.id)).toEqual(['ui'])
    // leaf nodes have no entry (only parents do)
    expect(tree.get('backend')).toBeUndefined()
  })
})

describe('rootNodes', () => {
  it('returns parentId-null nodes', () => {
    expect(rootNodes(NODES).map(n => n.id)).toEqual(['org'])
  })
})
