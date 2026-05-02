/**
 * Pi Tree Operations
 *
 * Tree building and branch extraction for Pi tree-structured sessions.
 *
 * Pi entries reference their parent via `parentId`. A "branch" is the ordered
 * sequence of entries from a leaf node up to the root. Each leaf yields one
 * branch; sibling leaves share their common-prefix ancestors.
 */

import debug from 'debug'

const log = debug('integrations:pi:tree')

/**
 * Build the parent/child tree from a flat entry list.
 *
 * Returns:
 *   {
 *     by_id: Map<id, entry>,
 *     children: Map<id|null, entry[]>,
 *     roots: entry[],
 *     orphans: entry[]   // entries whose parentId points outside the file
 *   }
 */
export const build_pi_entry_tree = ({ entries }) => {
  const by_id = new Map()
  for (const entry of entries) {
    if (entry?.id != null) by_id.set(entry.id, entry)
  }

  const children = new Map()
  const roots = []
  const orphans = []

  for (const entry of entries) {
    const parent_id = entry?.parentId ?? null
    if (parent_id == null) {
      roots.push(entry)
      const list = children.get(null) || []
      list.push(entry)
      children.set(null, list)
      continue
    }
    if (!by_id.has(parent_id)) {
      orphans.push(entry)
      log(
        `build_pi_entry_tree: entry ${entry.id} references unknown parent ${parent_id}; treating as root`
      )
      roots.push(entry)
      const list = children.get(null) || []
      list.push(entry)
      children.set(null, list)
      continue
    }
    const list = children.get(parent_id) || []
    list.push(entry)
    children.set(parent_id, list)
  }

  return { by_id, children, roots, orphans }
}

/**
 * Identify all leaf nodes -- entries with no children.
 */
export const find_pi_leaf_nodes = ({ tree }) => {
  const leaves = []
  for (const entry of tree.by_id.values()) {
    const child_list = tree.children.get(entry.id)
    if (!child_list || child_list.length === 0) {
      leaves.push(entry)
    }
  }
  return leaves
}

/**
 * Walk from a leaf entry up to its root, returning entries in root-to-leaf
 * order.
 */
export const extract_pi_branch = ({ tree, leaf }) => {
  const path = []
  const visited = new Set()
  let current = leaf
  while (current) {
    if (visited.has(current.id)) {
      throw new Error(
        `extract_pi_branch: cycle detected at entry ${current.id}`
      )
    }
    visited.add(current.id)
    path.push(current)
    const parent_id = current.parentId
    if (parent_id == null) break
    current = tree.by_id.get(parent_id) || null
  }
  return path.reverse()
}

/**
 * Extract every branch in the file. Returns an array of branches sorted by
 * the leaf timestamp (most recent first); index 0 is the primary branch.
 *
 * Each result is { branch_index, leaf_entry, entries }.
 */
export const extract_all_pi_branches = ({ entries }) => {
  const tree = build_pi_entry_tree({ entries })
  const leaves = find_pi_leaf_nodes({ tree })
  const decorated = leaves.map((leaf) => ({
    leaf,
    timestamp: extract_entry_timestamp_ms(leaf)
  }))
  decorated.sort((a, b) => b.timestamp - a.timestamp)

  return decorated.map(({ leaf }, idx) => ({
    branch_index: idx,
    leaf_entry: leaf,
    entries: extract_pi_branch({ tree, leaf })
  }))
}

/**
 * Identify all branch points (entries with more than one child) in O(n).
 *
 * Returns an array of { entry_id, child_ids } objects.
 */
export const identify_pi_branch_points = ({ entries }) => {
  const tree = build_pi_entry_tree({ entries })
  const branch_points = []
  for (const [parent_id, child_list] of tree.children.entries()) {
    if (parent_id == null) continue
    if (child_list.length > 1) {
      branch_points.push({
        entry_id: parent_id,
        child_ids: child_list.map((c) => c.id)
      })
    }
  }
  return branch_points
}

const extract_entry_timestamp_ms = (entry) => {
  const ts = entry?.timestamp ?? entry?.message?.timestamp
  if (ts == null) return 0
  if (typeof ts === 'number') return ts
  const ms = new Date(ts).getTime()
  return Number.isFinite(ms) ? ms : 0
}
