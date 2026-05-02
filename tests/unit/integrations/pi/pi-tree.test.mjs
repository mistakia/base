import { describe, it } from 'mocha'
import { expect } from 'chai'

import {
  build_pi_entry_tree,
  find_pi_leaf_nodes,
  extract_pi_branch,
  extract_all_pi_branches,
  identify_pi_branch_points
} from '#libs-server/integrations/pi/pi-tree.mjs'

const make_entry = (id, parentId, ts = 0, extra = {}) => ({
  id,
  parentId,
  type: 'message',
  role: 'user',
  content: id,
  timestamp: ts,
  ...extra
})

describe('Pi Tree Operations', () => {
  it('builds tree, finds leaves, walks branches in root-to-leaf order', () => {
    const entries = [
      make_entry('a', null, 1),
      make_entry('b', 'a', 2),
      make_entry('c', 'b', 3)
    ]
    const tree = build_pi_entry_tree({ entries })
    const leaves = find_pi_leaf_nodes({ tree })
    expect(leaves.map((e) => e.id)).to.deep.equal(['c'])
    const branch = extract_pi_branch({ tree, leaf: leaves[0] })
    expect(branch.map((e) => e.id)).to.deep.equal(['a', 'b', 'c'])
  })

  it('extract_all_pi_branches sorts by leaf timestamp (most recent first)', () => {
    const entries = [
      make_entry('a', null, 1),
      make_entry('b1', 'a', 2),
      make_entry('b2', 'a', 5)
    ]
    const branches = extract_all_pi_branches({ entries })
    expect(branches).to.have.length(2)
    expect(branches[0].leaf_entry.id).to.equal('b2')
    expect(branches[0].branch_index).to.equal(0)
    expect(branches[1].leaf_entry.id).to.equal('b1')
  })

  it('identify_pi_branch_points uses child-count, not pairwise comparison', () => {
    const entries = [
      make_entry('a', null, 1),
      make_entry('b1', 'a', 2),
      make_entry('b2', 'a', 5),
      make_entry('c', 'b1', 3)
    ]
    const points = identify_pi_branch_points({ entries })
    expect(points).to.have.length(1)
    expect(points[0].entry_id).to.equal('a')
    expect(points[0].child_ids.sort()).to.deep.equal(['b1', 'b2'])
  })
})
