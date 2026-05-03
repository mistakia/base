import { describe, it } from 'mocha'
import { expect } from 'chai'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RESOLVER_PATH = path.resolve(
  __dirname,
  '../../../../../../../.pi/sync-extension/lib/branch-resolver.ts'
)

const { resolve_active_branch } = await import(RESOLVER_PATH)

const make_ctx = ({ entries, leaf_id, session_file = '/tmp/sess.jsonl' }) => ({
  sessionManager: {
    getSessionFile: () => session_file,
    getEntries: () => entries,
    getLeafId: () => leaf_id
  }
})

describe('branch-resolver', () => {
  it('single-branch session resolves to <id>-branch-0', () => {
    const entries = [
      { id: 'sess-1', type: 'session' },
      { id: 'r', parentId: null, type: 'message', timestamp: 1 },
      { id: 'a', parentId: 'r', type: 'message', timestamp: 2 }
    ]
    const out = resolve_active_branch(make_ctx({ entries, leaf_id: 'a' }))
    expect(out.session_id).to.equal('sess-1-branch-0')
    expect(out.leaf_id).to.equal('a')
    expect(out.branch_index).to.equal(0)
    expect(out.session_file).to.equal('/tmp/sess.jsonl')
  })

  it('multi-branch resolves most-recent leaf to branch-0', () => {
    // Two leaves; "b" is newer (timestamp 3), "a" is older (timestamp 2)
    const entries = [
      { id: 'sess-2', type: 'session' },
      { id: 'r', parentId: null, type: 'message', timestamp: 1 },
      { id: 'a', parentId: 'r', type: 'message', timestamp: 2 },
      { id: 'b', parentId: 'r', type: 'message', timestamp: 3 }
    ]
    const out = resolve_active_branch(make_ctx({ entries, leaf_id: 'b' }))
    expect(out.session_id).to.equal('sess-2-branch-0')
    expect(out.leaf_id).to.equal('b')
    expect(out.branch_index).to.equal(0)
  })

  it('always pins to branch-0 (most-recent leaf) to match importer single_leaf_only', () => {
    // The session has two leaves; ctx.getLeafId() pointing at the older one
    // does not change the resolved session_id -- the importer always picks
    // the most-recent leaf when single_leaf_only is set, so the extension
    // must report the same coordinates.
    const entries = [
      { id: 'sess-3', type: 'session' },
      { id: 'r', parentId: null, type: 'message', timestamp: 1 },
      { id: 'a', parentId: 'r', type: 'message', timestamp: 2 },
      { id: 'b', parentId: 'r', type: 'message', timestamp: 3 }
    ]
    const first = resolve_active_branch(make_ctx({ entries, leaf_id: 'b' }))
    const second = resolve_active_branch(make_ctx({ entries, leaf_id: 'a' }))
    expect(first.session_id).to.equal('sess-3-branch-0')
    expect(first.leaf_id).to.equal('b')
    expect(second.session_id).to.equal('sess-3-branch-0')
    expect(second.leaf_id).to.equal('b')
  })

  it('throws when no session header is present', () => {
    const entries = [{ id: 'r', parentId: null, type: 'message', timestamp: 1 }]
    expect(() =>
      resolve_active_branch(make_ctx({ entries, leaf_id: 'r' }))
    ).to.throw(/no session header/)
  })

  it('parses ISO timestamp strings for leaf ordering', () => {
    const entries = [
      { id: 'sess-4', type: 'session' },
      { id: 'r', parentId: null, type: 'message', timestamp: '2026-04-02T00:00:00.000Z' },
      { id: 'a', parentId: 'r', type: 'message', timestamp: '2026-04-02T00:00:01.000Z' },
      { id: 'b', parentId: 'r', type: 'message', timestamp: '2026-04-02T00:00:02.000Z' }
    ]
    const out = resolve_active_branch(make_ctx({ entries, leaf_id: 'b' }))
    expect(out.session_id).to.equal('sess-4-branch-0')
    expect(out.branch_index).to.equal(0)
  })
})
