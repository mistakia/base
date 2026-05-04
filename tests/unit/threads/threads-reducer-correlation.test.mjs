import { describe, it } from 'mocha'
import { expect } from 'chai'

// ---------------------------------------------------------------------------
// Mirrored fragments of client/core/threads/reducer.js focused on
// prompt_correlation_id reconciliation. Kept inline because the reducer file
// uses bundler-only path aliases. Update this test alongside the production
// reducer when correlation behavior changes.
// ---------------------------------------------------------------------------

function build_optimistic_user_entry({
  thread_id,
  prompt,
  timestamp,
  prompt_correlation_id = undefined
}) {
  const entry = {
    id: prompt_correlation_id
      ? `optimistic-${prompt_correlation_id}`
      : `optimistic-${thread_id}-${Date.now()}`,
    type: 'message',
    role: 'user',
    content: prompt,
    timestamp,
    created_at: timestamp,
    _optimistic: true
  }
  if (prompt_correlation_id) {
    entry._prompt_correlation_id = prompt_correlation_id
  }
  return entry
}

function preserve_optimistic_entries(existing_timeline, fresh_timeline) {
  if (!existing_timeline || !Array.isArray(existing_timeline)) {
    return fresh_timeline
  }
  const base = Array.isArray(fresh_timeline) ? fresh_timeline : []
  const base_ids = new Set(base.map((e) => e?.id).filter(Boolean))
  const fresh_correlation_ids = new Set(
    base.map((e) => e?.prompt_correlation_id).filter(Boolean)
  )
  const real_kept = existing_timeline.filter(
    (e) => e && !e._optimistic && e.id && !base_ids.has(e.id)
  )
  const optimistic_kept = existing_timeline.filter(
    (e) =>
      e &&
      e._optimistic &&
      !(
        e._prompt_correlation_id &&
        fresh_correlation_ids.has(e._prompt_correlation_id)
      )
  )
  if (real_kept.length === 0 && optimistic_kept.length === 0) return base
  return [...base, ...real_kept, ...optimistic_kept]
}

// Three-tier THREAD_TIMELINE_ENTRY_ADDED handler operating on a plain timeline.
function apply_timeline_entry(timeline, entry) {
  // Tier 1: correlation-keyed swap
  if (entry.prompt_correlation_id) {
    const idx = timeline.findIndex(
      (e) => e._prompt_correlation_id === entry.prompt_correlation_id
    )
    if (idx !== -1) {
      const updated = [...timeline]
      updated[idx] = entry
      return updated
    }
  }

  // Tier 2: legacy fallback
  if (
    !entry.prompt_correlation_id &&
    entry.type === 'message' &&
    entry.role === 'user'
  ) {
    const idx = timeline.findIndex(
      (e) => e._optimistic && e.role === 'user' && !e._prompt_correlation_id
    )
    if (idx !== -1) {
      const updated = [...timeline]
      updated[idx] = entry
      return updated
    }
  }

  // Tier 3: id-keyed upsert
  if (entry.id) {
    const idx = timeline.findIndex((e) => e.id === entry.id)
    if (idx !== -1) {
      const updated = [...timeline]
      updated[idx] = entry
      return updated
    }
  }
  return [...timeline, entry]
}

describe('threads reducer prompt_correlation_id reconciliation', () => {
  describe('THREAD_TIMELINE_ENTRY_ADDED three-tier swap', () => {
    it('tier-1: tagged entry swaps the matching optimistic entry in place', () => {
      const K = 'k-1'
      const optimistic = build_optimistic_user_entry({
        thread_id: 't',
        prompt: 'hi',
        timestamp: '2026-01-01T00:00:00Z',
        prompt_correlation_id: K
      })
      const timeline = [optimistic]
      const real = {
        id: 'jsonl-uuid-1',
        type: 'message',
        role: 'user',
        content: 'hi',
        timestamp: '2026-01-01T00:00:01Z',
        prompt_correlation_id: K
      }
      const out = apply_timeline_entry(timeline, real)
      expect(out).to.have.lengthOf(1)
      expect(out[0].id).to.equal('jsonl-uuid-1')
      expect(out[0]._optimistic).to.be.undefined
      expect(out[0]._prompt_correlation_id).to.be.undefined
    })

    it('tier-2: untagged user message replaces an untagged optimistic entry', () => {
      const optimistic = {
        id: 'optimistic-legacy',
        type: 'message',
        role: 'user',
        content: 'legacy',
        timestamp: '2026-01-01T00:00:00Z',
        _optimistic: true
      }
      const real = {
        id: 'jsonl-uuid-2',
        type: 'message',
        role: 'user',
        content: 'legacy',
        timestamp: '2026-01-01T00:00:01Z'
      }
      const out = apply_timeline_entry([optimistic], real)
      expect(out).to.have.lengthOf(1)
      expect(out[0].id).to.equal('jsonl-uuid-2')
    })

    it('tier-2 does NOT fire when optimistic is tagged: untagged incoming falls through to append', () => {
      const optimistic = build_optimistic_user_entry({
        thread_id: 't',
        prompt: 'q',
        timestamp: '2026-01-01T00:00:00Z',
        prompt_correlation_id: 'k-2'
      })
      const untagged_incoming = {
        id: 'jsonl-uuid-stale',
        type: 'message',
        role: 'user',
        content: 'q',
        timestamp: '2026-01-01T00:00:01Z'
      }
      const out = apply_timeline_entry([optimistic], untagged_incoming)
      expect(out).to.have.lengthOf(2)
      expect(out[0]._prompt_correlation_id).to.equal('k-2')
      expect(out[1].id).to.equal('jsonl-uuid-stale')
    })

    it('tagged-then-untagged sequencing: real tagged entry swaps without producing a duplicate', () => {
      const K = 'k-3'
      const optimistic = build_optimistic_user_entry({
        thread_id: 't',
        prompt: 'q',
        timestamp: '2026-01-01T00:00:00Z',
        prompt_correlation_id: K
      })
      const untagged = {
        id: 'untagged',
        type: 'message',
        role: 'user',
        content: 'q',
        timestamp: '2026-01-01T00:00:01Z'
      }
      const real_tagged = {
        id: 'real-uuid',
        type: 'message',
        role: 'user',
        content: 'q',
        timestamp: '2026-01-01T00:00:02Z',
        prompt_correlation_id: K
      }
      const after_untagged = apply_timeline_entry([optimistic], untagged)
      const after_real = apply_timeline_entry(after_untagged, real_tagged)
      const user_messages = after_real.filter(
        (e) => e.role === 'user' && e.type === 'message'
      )
      expect(user_messages.map((e) => e.id)).to.deep.equal([
        'real-uuid',
        'untagged'
      ])
    })

    it('tier-3: id-keyed upsert replaces a matching cached entry in place', () => {
      const cached = {
        id: 'sys-1',
        type: 'system',
        timestamp: '2026-01-01T00:00:00Z'
      }
      const updated = {
        id: 'sys-1',
        type: 'system',
        timestamp: '2026-01-01T00:00:00Z',
        text: 'new'
      }
      const out = apply_timeline_entry([cached], updated)
      expect(out).to.have.lengthOf(1)
      expect(out[0].text).to.equal('new')
    })
  })

  describe('preserve_optimistic_entries correlation merge', () => {
    it('drops optimistic entries whose correlation id appears in fresh timeline', () => {
      const K = 'corr-1'
      const optimistic = build_optimistic_user_entry({
        thread_id: 't',
        prompt: 'q',
        timestamp: '2026-01-01T00:00:00Z',
        prompt_correlation_id: K
      })
      const fresh = [
        {
          id: 'jsonl-1',
          type: 'message',
          role: 'user',
          prompt_correlation_id: K
        }
      ]
      const out = preserve_optimistic_entries([optimistic], fresh)
      expect(out).to.have.lengthOf(1)
      expect(out[0].id).to.equal('jsonl-1')
    })

    it('preserves in-flight non-optimistic entries by id', () => {
      const inflight = { id: 'in-flight', type: 'message', role: 'assistant' }
      const fresh = [{ id: 'snapshot', type: 'system' }]
      const out = preserve_optimistic_entries([inflight], fresh)
      expect(out.map((e) => e.id)).to.include.members(['snapshot', 'in-flight'])
    })
  })

  describe('build_optimistic_user_entry', () => {
    it('CREATE-path seeding: stamps _prompt_correlation_id on the optimistic entry', () => {
      const K = 'create-K'
      const entry = build_optimistic_user_entry({
        thread_id: 't',
        prompt: 'hi',
        timestamp: '2026-01-01T00:00:00Z',
        prompt_correlation_id: K
      })
      expect(entry._prompt_correlation_id).to.equal(K)
      expect(entry._optimistic).to.equal(true)
      expect(entry.id).to.equal(`optimistic-${K}`)
    })

    it('RESUME-path seeding: same shape', () => {
      const K = 'resume-K'
      const entry = build_optimistic_user_entry({
        thread_id: 't',
        prompt: 'q',
        timestamp: '2026-01-01T00:00:00Z',
        prompt_correlation_id: K
      })
      expect(entry._prompt_correlation_id).to.equal(K)
    })

    it('legacy submit (no correlation id) does not stamp the field', () => {
      const entry = build_optimistic_user_entry({
        thread_id: 't',
        prompt: 'q',
        timestamp: '2026-01-01T00:00:00Z'
      })
      expect(entry._prompt_correlation_id).to.be.undefined
      expect(entry.id).to.match(/^optimistic-t-\d+$/)
    })
  })
})
