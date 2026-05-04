import { describe, it } from 'mocha'
import { expect } from 'chai'

// Mirror of the entry_key derivation in TimelineList.js. Update both in
// lockstep when the React key derivation changes.
const compute_entry_key = (entry, index) =>
  entry._prompt_correlation_id ||
  entry.prompt_correlation_id ||
  entry.id ||
  `${entry.type}-${index}`

describe('TimelineList React key stability across optimistic-to-persisted swap', () => {
  it('key does not change when an optimistic entry is replaced by its persisted form', () => {
    const K = 'corr-K'
    const optimistic = {
      id: `optimistic-${K}`,
      type: 'message',
      role: 'user',
      _optimistic: true,
      _prompt_correlation_id: K
    }
    const persisted = {
      id: 'jsonl-uuid',
      type: 'message',
      role: 'user',
      prompt_correlation_id: K
    }
    expect(compute_entry_key(optimistic, 0)).to.equal(
      compute_entry_key(persisted, 0)
    )
  })

  it('untagged entries fall back to entry.id', () => {
    const entry = { id: 'sys-1', type: 'system' }
    expect(compute_entry_key(entry, 5)).to.equal('sys-1')
  })

  it('legacy entries with no id fall back to type-index', () => {
    const entry = { type: 'message' }
    expect(compute_entry_key(entry, 7)).to.equal('message-7')
  })
})
