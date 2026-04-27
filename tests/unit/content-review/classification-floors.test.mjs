import { expect } from 'chai'

import {
  apply_filter_floor,
  apply_regex_floor
} from '#libs-server/content-review/classification-floors.mjs'

const PF_CONFIG = {
  label_floor: {
    secret: 'private',
    account_number: 'private',
    private_address: 'private',
    private_email: 'private',
    private_phone: 'private',
    private_url: 'private',
    private_date: 'private',
    private_person: 'acquaintance'
  }
}

describe('classification-floors', () => {
  describe('apply_regex_floor', () => {
    it('does nothing when findings array is empty', () => {
      const result = { classification: 'public', reasoning: 'r' }
      apply_regex_floor(result, [])
      expect(result.classification).to.equal('public')
      expect(result.regex_floor_applied).to.be.undefined
    })

    it('floors public to private on personal_names', () => {
      const result = { classification: 'public', reasoning: 'r' }
      apply_regex_floor(result, [{ category: 'personal_names' }])
      expect(result.classification).to.equal('private')
      expect(result.regex_floor_applied).to.be.true
    })

    it('floors acquaintance to private on personal_property', () => {
      const result = { classification: 'acquaintance', reasoning: 'r' }
      apply_regex_floor(result, [{ category: 'personal_property' }])
      expect(result.classification).to.equal('private')
    })

    it('floors public to private on personal_locations', () => {
      const result = { classification: 'public', reasoning: 'r' }
      apply_regex_floor(result, [{ category: 'personal_locations' }])
      expect(result.classification).to.equal('private')
    })

    it('does not modify already-private classification', () => {
      const result = { classification: 'private', reasoning: 'r' }
      apply_regex_floor(result, [{ category: 'personal_names' }])
      expect(result.regex_floor_applied).to.be.undefined
    })

    it('ignores non-floor categories', () => {
      const result = { classification: 'public', reasoning: 'r' }
      apply_regex_floor(result, [{ category: 'secrets' }])
      expect(result.classification).to.equal('public')
    })
  })

  describe('apply_filter_floor', () => {
    it('does nothing when filter_result is null', () => {
      const result = { classification: 'public', reasoning: 'r' }
      apply_filter_floor(result, null, PF_CONFIG)
      expect(result.classification).to.equal('public')
      expect(result.filter_floor_applied).to.be.undefined
    })

    it('does nothing when labels_found is empty', () => {
      const result = { classification: 'public', reasoning: 'r' }
      apply_filter_floor(result, { labels_found: [] }, PF_CONFIG)
      expect(result.classification).to.equal('public')
    })

    it('floors public to private on private_email label', () => {
      const result = { classification: 'public', reasoning: 'r' }
      apply_filter_floor(
        result,
        { labels_found: ['private_email'] },
        PF_CONFIG
      )
      expect(result.classification).to.equal('private')
      expect(result.filter_floor_applied).to.be.true
    })

    it('floors public to acquaintance on private_person only', () => {
      const result = { classification: 'public', reasoning: 'r' }
      apply_filter_floor(
        result,
        { labels_found: ['private_person'] },
        PF_CONFIG
      )
      expect(result.classification).to.equal('acquaintance')
      expect(result.filter_floor_applied).to.be.true
    })

    it('chooses most-restrictive when multiple labels present', () => {
      const result = { classification: 'public', reasoning: 'r' }
      apply_filter_floor(
        result,
        { labels_found: ['private_person', 'secret'] },
        PF_CONFIG
      )
      expect(result.classification).to.equal('private')
    })

    it('does not downgrade an already-private result', () => {
      const result = { classification: 'private', reasoning: 'r' }
      apply_filter_floor(
        result,
        { labels_found: ['private_person'] },
        PF_CONFIG
      )
      expect(result.classification).to.equal('private')
      expect(result.filter_floor_applied).to.be.undefined
    })

    it('ignores labels not in label_floor', () => {
      const result = { classification: 'public', reasoning: 'r' }
      apply_filter_floor(
        result,
        { labels_found: ['unknown_label'] },
        PF_CONFIG
      )
      expect(result.classification).to.equal('public')
    })

    it('handles missing label_floor gracefully', () => {
      const result = { classification: 'public', reasoning: 'r' }
      apply_filter_floor(result, { labels_found: ['private_email'] }, {})
      expect(result.classification).to.equal('public')
    })
  })

  describe('combined floors', () => {
    it('regex floor + filter floor compose to most-restrictive', () => {
      const result = { classification: 'public', reasoning: 'r' }
      apply_regex_floor(result, [{ category: 'personal_names' }])
      apply_filter_floor(
        result,
        { labels_found: ['private_person'] },
        PF_CONFIG
      )
      expect(result.classification).to.equal('private')
      expect(result.regex_floor_applied).to.be.true
    })
  })
})
