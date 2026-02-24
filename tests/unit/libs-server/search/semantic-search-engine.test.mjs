import { expect } from 'chai'

import { search_semantic } from '#libs-server/search/semantic-search-engine.mjs'

describe('Semantic Search Engine', function () {
  it('should return empty results for empty query', async () => {
    const result = await search_semantic({ query: '' })
    expect(result.results).to.deep.equal([])
    expect(result.available).to.be.true
  })

  it('should return empty results for whitespace-only query', async () => {
    const result = await search_semantic({ query: '   ' })
    expect(result.results).to.deep.equal([])
    expect(result.available).to.be.true
  })

  it('should return unavailable when Ollama is not running', async () => {
    // In test environment, Ollama is not running, so embed_texts will fail
    const result = await search_semantic({ query: 'test query' })
    expect(result.results).to.deep.equal([])
    expect(result.available).to.be.false
  })
})
