import { expect } from 'chai'

import { deterministic_timeline_entry_id } from '#libs-shared/timeline/deterministic-id.mjs'

describe('deterministic_timeline_entry_id (source-intrinsic key)', () => {
  const base = {
    thread_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    timestamp: '2026-04-18T12:00:00.000Z',
    type: 'message',
    system_type: '',
    source_uuid: 'src-uuid-1'
  }

  it('is stable for the same (thread_id, timestamp, type, system_type, source_uuid)', () => {
    expect(deterministic_timeline_entry_id(base)).to.equal(
      deterministic_timeline_entry_id(base)
    )
  })

  it('produces a different id for a different source_uuid', () => {
    const a = deterministic_timeline_entry_id(base)
    const b = deterministic_timeline_entry_id({ ...base, source_uuid: 'src-uuid-2' })
    expect(a).to.not.equal(b)
  })

  it('disambiguates via discriminator at the same source_uuid', () => {
    const a = deterministic_timeline_entry_id({ ...base, discriminator: 'd1' })
    const b = deterministic_timeline_entry_id({ ...base, discriminator: 'd2' })
    expect(a).to.not.equal(b)
  })

  it('throws when both source_uuid and discriminator are empty', () => {
    expect(() =>
      deterministic_timeline_entry_id({ ...base, source_uuid: '', discriminator: '' })
    ).to.throw(/source_uuid or discriminator/)
  })

  it('ignores the legacy sequence parameter (no-op)', () => {
    const a = deterministic_timeline_entry_id(base)
    const b = deterministic_timeline_entry_id({ ...base, sequence: 42 })
    expect(a).to.equal(b)
  })
})
