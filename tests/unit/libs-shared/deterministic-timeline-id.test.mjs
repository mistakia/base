import { expect } from 'chai'

import { deterministic_timeline_entry_id } from '#libs-shared/timeline/deterministic-id.mjs'

describe('deterministic_timeline_entry_id', () => {
  const base = {
    thread_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    timestamp: '2026-04-17T05:00:00.000Z',
    type: 'system',
    system_type: 'status',
    sequence: 0
  }

  it('returns a uuid v5 string', () => {
    const id = deterministic_timeline_entry_id(base)
    expect(id).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('is deterministic for identical input', () => {
    expect(deterministic_timeline_entry_id(base)).to.equal(
      deterministic_timeline_entry_id(base)
    )
  })

  it('accepts a Date timestamp and matches the iso-string form', () => {
    const date = new Date(base.timestamp)
    expect(deterministic_timeline_entry_id({ ...base, timestamp: date })).to.equal(
      deterministic_timeline_entry_id(base)
    )
  })

  it('produces distinct ids for different thread_id', () => {
    const a = deterministic_timeline_entry_id(base)
    const b = deterministic_timeline_entry_id({ ...base, thread_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' })
    expect(a).to.not.equal(b)
  })

  it('produces distinct ids for different timestamp', () => {
    const a = deterministic_timeline_entry_id(base)
    const b = deterministic_timeline_entry_id({ ...base, timestamp: '2026-04-17T05:00:00.001Z' })
    expect(a).to.not.equal(b)
  })

  it('produces distinct ids for different sequence', () => {
    const a = deterministic_timeline_entry_id(base)
    const b = deterministic_timeline_entry_id({ ...base, sequence: 1 })
    expect(a).to.not.equal(b)
  })

  it('produces distinct ids for different system_type', () => {
    const a = deterministic_timeline_entry_id(base)
    const b = deterministic_timeline_entry_id({ ...base, system_type: 'configuration' })
    expect(a).to.not.equal(b)
  })

  it('uses the discriminator to disambiguate when other fields collide', () => {
    const a = deterministic_timeline_entry_id({ ...base, discriminator: 'a' })
    const b = deterministic_timeline_entry_id({ ...base, discriminator: 'b' })
    expect(a).to.not.equal(b)
  })

  it('throws when thread_id missing', () => {
    expect(() => deterministic_timeline_entry_id({ ...base, thread_id: undefined })).to.throw(/thread_id required/)
  })

  it('throws when timestamp missing', () => {
    expect(() => deterministic_timeline_entry_id({ ...base, timestamp: undefined })).to.throw(/timestamp required/)
  })

  it('throws when type missing', () => {
    expect(() => deterministic_timeline_entry_id({ ...base, type: undefined })).to.throw(/type required/)
  })
})
