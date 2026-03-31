import { expect } from 'chai'

import { search_semantic } from '#libs-server/search/semantic-search-engine.mjs'

// Detect whether Ollama is available by attempting a lightweight embed call
async function is_ollama_available() {
  try {
    const base_url = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
    const response = await fetch(`${base_url}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', input: ['test'] }),
      signal: AbortSignal.timeout(3000)
    })
    return response.ok
  } catch {
    return false
  }
}

describe('Semantic Search Engine', function () {
  let ollama_available

  before(async function () {
    ollama_available = await is_ollama_available()
  })

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

  it('should report availability based on Ollama status', async function () {
    const result = await search_semantic({ query: 'test query' })
    expect(result.results).to.deep.equal([])
    expect(result.available).to.equal(ollama_available)
  })
})
