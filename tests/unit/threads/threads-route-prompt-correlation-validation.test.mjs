import { describe, it } from 'mocha'
import { expect } from 'chai'
import crypto from 'crypto'

// Mirror of the regex defined in server/routes/threads.mjs. Update both in
// lockstep when the validator changes.
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const is_valid_uuid_v4 = (value) =>
  typeof value === 'string' && UUID_V4_REGEX.test(value)

describe('thread route prompt_correlation_id validation', () => {
  it('rejects a non-uuid string', () => {
    expect(is_valid_uuid_v4('not-a-uuid')).to.equal(false)
  })

  it('rejects a v1 uuid', () => {
    expect(is_valid_uuid_v4('00000000-0000-1000-8000-000000000000')).to.equal(
      false
    )
  })

  it('accepts a uuid v4 from crypto.randomUUID()', () => {
    expect(is_valid_uuid_v4(crypto.randomUUID())).to.equal(true)
  })

  it('rejects non-string input', () => {
    expect(is_valid_uuid_v4(undefined)).to.equal(false)
    expect(is_valid_uuid_v4(null)).to.equal(false)
    expect(is_valid_uuid_v4(123)).to.equal(false)
    expect(is_valid_uuid_v4({})).to.equal(false)
  })
})
