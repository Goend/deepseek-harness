/** Org-tree derivation: turn a flat node list into a parent->children map. */

import type { OrgNodeData } from './index.ts'

/** Children keyed by parent id; the root's children live under `null`. */
export function buildOrgTree(nodes: readonly OrgNodeData[]): Map<string | null, OrgNodeData[]> {
  const tree = new Map<string | null, OrgNodeData[]>()
  for (const node of nodes) {
    const children = tree.get(node.parentId) ?? []
    children.push(node)
    tree.set(node.parentId, children)
  }
  return tree
}

/** Root nodes (parentId null), in insertion order. */
export function rootNodes(nodes: readonly OrgNodeData[]): readonly OrgNodeData[] {
  return nodes.filter(n => n.parentId === null)
}
