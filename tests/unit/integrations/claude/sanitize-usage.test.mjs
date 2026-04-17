import { expect } from 'chai'

import { sanitize_usage } from '#libs-server/integrations/claude/normalize-session.mjs'

describe('sanitize_usage', () => {
  it('drops null service_tier (observed null leak from Anthropic)', () => {
    const out = sanitize_usage({
      input_tokens: 10,
      output_tokens: 20,
      service_tier: null
    })
    expect(out).to.deep.equal({ input_tokens: 10, output_tokens: 20 })
    expect(out).to.not.have.property('service_tier')
  })

  it('preserves string service_tier', () => {
    const out = sanitize_usage({ service_tier: 'standard' })
    expect(out).to.deep.equal({ service_tier: 'standard' })
  })

  it('drops undefined values', () => {
    const out = sanitize_usage({ a: 1, b: undefined })
    expect(out).to.deep.equal({ a: 1 })
  })

  it('preserves zero and false', () => {
    const out = sanitize_usage({ cache_read_input_tokens: 0, enabled: false })
    expect(out).to.deep.equal({ cache_read_input_tokens: 0, enabled: false })
  })

  it('returns input unchanged for null/undefined/non-object', () => {
    expect(sanitize_usage(null)).to.equal(null)
    expect(sanitize_usage(undefined)).to.equal(undefined)
    expect(sanitize_usage('str')).to.equal('str')
  })
})
