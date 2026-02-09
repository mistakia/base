import { expect } from 'chai'
import {
  calculate_relation_sort_score,
  sort_relations_by_weighted_score,
  get_relation_priority,
  RELATION_CREATES,
  RELATION_MODIFIES,
  RELATION_ACCESSES,
  RELATION_RELATES_TO
} from '#libs-shared/entity-relations.mjs'

describe('Entity Relations Sorting', () => {
  describe('get_relation_priority', () => {
    it('should return priority for known relation types', () => {
      expect(
        get_relation_priority({ relation_type: RELATION_CREATES })
      ).to.equal(1)
      expect(
        get_relation_priority({ relation_type: RELATION_MODIFIES })
      ).to.equal(2)
      expect(get_relation_priority({ relation_type: 'implements' })).to.equal(3)
      expect(get_relation_priority({ relation_type: 'follows' })).to.equal(4)
    })

    it('should return 50 for unknown relation types', () => {
      expect(get_relation_priority({ relation_type: 'unknown_type' })).to.equal(
        50
      )
    })

    it('should return 100 for null/undefined relation type', () => {
      expect(get_relation_priority({ relation_type: null })).to.equal(100)
      expect(get_relation_priority({ relation_type: undefined })).to.equal(100)
    })
  })

  describe('calculate_relation_sort_score', () => {
    it('should combine priority and recency for recent update', () => {
      const now = new Date()
      const score = calculate_relation_sort_score({
        relation_type: RELATION_CREATES,
        updated_at: now.toISOString()
      })

      // Priority 1 + recency ~0 = ~1
      expect(score).to.be.closeTo(1, 0.1)
    })

    it('should give higher score (lower priority) for older updates', () => {
      const one_week_ago = new Date()
      one_week_ago.setDate(one_week_ago.getDate() - 7)

      const score = calculate_relation_sort_score({
        relation_type: RELATION_CREATES,
        updated_at: one_week_ago.toISOString()
      })

      // Priority 1 + recency 50 (capped at 1 week) = ~51
      expect(score).to.be.closeTo(51, 0.5)
    })

    it('should cap recency score at 1 week', () => {
      const one_month_ago = new Date()
      one_month_ago.setMonth(one_month_ago.getMonth() - 1)

      const score = calculate_relation_sort_score({
        relation_type: RELATION_CREATES,
        updated_at: one_month_ago.toISOString()
      })

      // Priority 1 + recency 50 (capped) = 51
      expect(score).to.be.closeTo(51, 0.1)
    })

    it('should use default recency for missing updated_at', () => {
      const score = calculate_relation_sort_score({
        relation_type: RELATION_CREATES,
        updated_at: null
      })

      // Priority 1 + default recency 50 = 51
      expect(score).to.equal(51)
    })

    it('should factor in relation type priority', () => {
      const now = new Date().toISOString()

      const creates_score = calculate_relation_sort_score({
        relation_type: RELATION_CREATES,
        updated_at: now
      })

      const accesses_score = calculate_relation_sort_score({
        relation_type: RELATION_ACCESSES,
        updated_at: now
      })

      // CREATES (priority 1) should be lower than ACCESSES (priority 30)
      expect(creates_score).to.be.lessThan(accesses_score)
    })
  })

  describe('sort_relations_by_weighted_score', () => {
    it('should sort by combined score (priority + recency)', () => {
      const now = new Date()
      const one_day_ago = new Date(now)
      one_day_ago.setDate(one_day_ago.getDate() - 1)

      const relations = [
        {
          relation_type: RELATION_ACCESSES,
          updated_at: now.toISOString()
        },
        {
          relation_type: RELATION_CREATES,
          updated_at: one_day_ago.toISOString()
        },
        {
          relation_type: RELATION_MODIFIES,
          updated_at: now.toISOString()
        }
      ]

      const sorted = sort_relations_by_weighted_score({ relations })

      // MODIFIES (priority 2, now) should be first
      // CREATES (priority 1, 1 day ago) second (higher recency penalty)
      // ACCESSES (priority 30, now) should be last
      expect(sorted[0].relation_type).to.equal(RELATION_MODIFIES)
      expect(sorted[2].relation_type).to.equal(RELATION_ACCESSES)
    })

    it('should return empty array for empty input', () => {
      expect(sort_relations_by_weighted_score({ relations: [] })).to.deep.equal(
        []
      )
    })

    it('should return empty array for null input', () => {
      expect(
        sort_relations_by_weighted_score({ relations: null })
      ).to.deep.equal([])
    })

    it('should not mutate original array', () => {
      const now = new Date().toISOString()
      const relations = [
        { relation_type: RELATION_ACCESSES, updated_at: now },
        { relation_type: RELATION_CREATES, updated_at: now }
      ]

      const original_first = relations[0]
      sort_relations_by_weighted_score({ relations })

      expect(relations[0]).to.equal(original_first)
    })

    it('should handle relations without updated_at', () => {
      const now = new Date().toISOString()
      const relations = [
        { relation_type: RELATION_CREATES, updated_at: now },
        { relation_type: RELATION_CREATES }, // No updated_at
        { relation_type: RELATION_MODIFIES, updated_at: now }
      ]

      const sorted = sort_relations_by_weighted_score({ relations })

      // Relations with updated_at should come before those without
      // (assuming same priority, recent > missing)
      expect(sorted).to.have.lengthOf(3)
      // CREATES with updated_at should be before CREATES without
      expect(sorted[0].updated_at).to.equal(now)
    })

    it('should prioritize high-priority recent over low-priority old', () => {
      const now = new Date()
      const one_week_ago = new Date()
      one_week_ago.setDate(one_week_ago.getDate() - 7)

      const relations = [
        {
          relation_type: RELATION_RELATES_TO, // priority 20
          updated_at: one_week_ago.toISOString()
        },
        {
          relation_type: RELATION_CREATES, // priority 1
          updated_at: now.toISOString()
        }
      ]

      const sorted = sort_relations_by_weighted_score({ relations })

      // CREATES (1 + ~0 = ~1) should beat RELATES_TO (20 + 50 = 70)
      expect(sorted[0].relation_type).to.equal(RELATION_CREATES)
    })
  })
})
