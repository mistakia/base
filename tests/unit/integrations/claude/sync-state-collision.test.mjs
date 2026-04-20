import { describe, it, afterEach } from 'mocha'
import { expect } from 'chai'

import {
  load_sync_state,
  save_sync_state,
  clear_sync_state
} from '#libs-server/integrations/claude/sync-state.mjs'

describe('claude sync-state collision', function () {
  const path_a = '/tmp/a/claude-session.jsonl'
  const path_b = '/tmp/b/claude-session.jsonl'

  afterEach(async () => {
    await clear_sync_state({ session_id: path_a }).catch(() => {})
    await clear_sync_state({ session_id: path_b }).catch(() => {})
  })

  it('distinct absolute paths sharing a basename do not collide', async () => {
    await save_sync_state({
      session_id: path_a,
      state: {
        byte_offset: 42,
        subagent_offsets: {},
        working_directory: '/tmp/a'
      }
    })

    const loaded = await load_sync_state({ session_id: path_b })
    expect(loaded).to.be.null
  })

  it('round-trips save/load for the same absolute path', async () => {
    const state = {
      byte_offset: 99,
      subagent_offsets: { 'agent-x.jsonl': { byte_offset: 7 } },
      working_directory: '/tmp/a'
    }
    await save_sync_state({ session_id: path_a, state })

    const loaded = await load_sync_state({ session_id: path_a })
    expect(loaded).to.deep.equal(state)
  })

  it('clearing one path leaves a sibling path intact', async () => {
    const state_a = {
      byte_offset: 10,
      subagent_offsets: {},
      working_directory: '/tmp/a'
    }
    const state_b = {
      byte_offset: 20,
      subagent_offsets: {},
      working_directory: '/tmp/b'
    }

    await save_sync_state({ session_id: path_a, state: state_a })
    await save_sync_state({ session_id: path_b, state: state_b })

    await clear_sync_state({ session_id: path_a })

    expect(await load_sync_state({ session_id: path_a })).to.be.null
    expect(await load_sync_state({ session_id: path_b })).to.deep.equal(state_b)
  })
})
