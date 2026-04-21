import { expect } from 'chai'

import {
  rank,
  SOURCE_WEIGHTS,
  RECENCY_MAX_BOOST
} from '#libs-server/search/ranker.mjs'

describe('search ranker', () => {
  it('returns empty array for empty input', () => {
    expect(rank({ hits: [] })).to.deep.equal([])
  })

  it('normalizes raw_score per source and applies source weights', () => {
    const hits = [
      {
        entity_uri: 'user:task/a.md',
        matches: [{ source: 'entity', raw_score: 10 }]
      },
      {
        entity_uri: 'user:task/b.md',
        matches: [{ source: 'entity', raw_score: 5 }]
      }
    ]

    const ranked = rank({ hits })
    expect(ranked[0].entity_uri).to.equal('user:task/a.md')
    // Top of range normalizes to 1.0, weighted by entity weight
    expect(ranked[0].score).to.be.closeTo(SOURCE_WEIGHTS.entity, 0.001)
    // Bottom of range normalizes to 0.0
    expect(ranked[1].score).to.be.closeTo(0, 0.001)
  })

  it('sums across sources but only takes the best weighted score per source', () => {
    const hits = [
      {
        entity_uri: 'user:task/a.md',
        matches: [
          { source: 'entity', raw_score: 10 },
          { source: 'thread_timeline', raw_score: 100 },
          { source: 'thread_timeline', raw_score: 50 }
        ]
      },
      {
        entity_uri: 'user:task/b.md',
        matches: [
          { source: 'entity', raw_score: 10 },
          { source: 'thread_timeline', raw_score: 100 }
        ]
      }
    ]

    const ranked = rank({ hits })
    // Duplicate thread_timeline hits for the same entity must not double-count
    expect(ranked[0].score).to.equal(ranked[1].score)
  })

  it('applies a bounded recency boost', () => {
    const fresh = new Date().toISOString()
    const ancient = new Date('2000-01-01').toISOString()
    const hits = [
      {
        entity_uri: 'user:task/fresh.md',
        matches: [{ source: 'entity', raw_score: 1 }],
        updated_at: fresh
      },
      {
        entity_uri: 'user:task/ancient.md',
        matches: [{ source: 'entity', raw_score: 1 }],
        updated_at: ancient
      }
    ]

    const ranked = rank({ hits })
    expect(ranked[0].entity_uri).to.equal('user:task/fresh.md')
    const difference = ranked[0].score - ranked[1].score
    expect(difference).to.be.greaterThan(0)
    expect(difference).to.be.at.most(RECENCY_MAX_BOOST + 1e-9)
  })
})
