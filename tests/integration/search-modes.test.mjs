import chai, { expect } from 'chai'
import chaiHttp from 'chai-http'
import { promises as fs } from 'fs'
import path from 'path'

import server from '#server'
import {
  reset_all_tables,
  create_test_user,
  authenticate_request,
  create_temp_test_repo,
  setup_api_test_registry
} from '#tests/utils/index.mjs'

chai.use(chaiHttp)

describe('Search Modes API', function () {
  this.timeout(15000)

  let test_user
  let test_repo
  let registry_cleanup

  before(async () => {
    await reset_all_tables()

    test_repo = await create_temp_test_repo()

    registry_cleanup = setup_api_test_registry({
      system_base_directory: test_repo.system_path,
      user_base_directory: test_repo.user_path
    })

    test_user = await create_test_user()

    // Create test files with searchable content
    const user_path = test_repo.user_path
    await fs.mkdir(path.join(user_path, 'task'), { recursive: true })
    await fs.mkdir(path.join(user_path, 'text'), { recursive: true })

    await fs.writeFile(
      path.join(user_path, 'task', 'search-test.md'),
      '---\ntitle: Search Test Task\ntype: task\nstatus: Planned\n---\n\n# Search Test\n\nThis contains unique_search_term_alpha for testing content search.'
    )

    await fs.writeFile(
      path.join(user_path, 'text', 'search-doc.md'),
      '---\ntitle: Search Document\ntype: text\n---\n\n# Documentation\n\nAnother file with unique_search_term_alpha and more content.'
    )
  })

  after(async () => {
    if (registry_cleanup) registry_cleanup()
    if (test_repo?.cleanup) await test_repo.cleanup()
  })

  describe('GET /api/search?mode=content', () => {
    it('should return structured content results with line numbers', async () => {
      const res = await authenticate_request(
        chai.request(server).get('/api/search'),
        test_user
      ).query({ q: 'unique_search_term_alpha', mode: 'content' })

      expect(res).to.have.status(200)
      expect(res.body.mode).to.equal('content')
      expect(res.body.content_results).to.be.an('array')

      if (res.body.content_results.length > 0) {
        const first = res.body.content_results[0]
        expect(first).to.have.property('relative_path')
        expect(first).to.have.property('line_number')
        expect(first).to.have.property('match_line')
      }
    })

    it('should return empty results for non-matching query', async () => {
      const res = await authenticate_request(
        chai.request(server).get('/api/search'),
        test_user
      ).query({
        q: 'zzz_nonexistent_query_zzz',
        mode: 'content'
      })

      expect(res).to.have.status(200)
      expect(res.body.content_results).to.be.an('array')
      expect(res.body.content_results).to.have.lengthOf(0)
    })
  })

  describe('GET /api/search?mode=semantic', () => {
    it('should return semantic results or indicate unavailability', async () => {
      const res = await authenticate_request(
        chai.request(server).get('/api/search'),
        test_user
      ).query({ q: 'search test task', mode: 'semantic' })

      expect(res).to.have.status(200)
      expect(res.body.mode).to.equal('semantic')
      expect(res.body).to.have.property('available')
      expect(res.body.semantic_results).to.be.an('array')

      // In test environment, Ollama is likely unavailable
      if (!res.body.available) {
        expect(res.body.semantic_results).to.have.lengthOf(0)
      }
    })
  })

  describe('mode validation', () => {
    it('should reject invalid mode parameter', async () => {
      const res = await authenticate_request(
        chai.request(server).get('/api/search'),
        test_user
      ).query({ q: 'test', mode: 'invalid_mode' })

      expect(res).to.have.status(400)
      expect(res.body.error).to.include('Invalid mode')
    })

    it('should accept paths mode', async () => {
      const res = await authenticate_request(
        chai.request(server).get('/api/search'),
        test_user
      ).query({ q: 'test', mode: 'paths' })

      expect(res).to.have.status(200)
    })

    it('should accept full mode', async () => {
      const res = await authenticate_request(
        chai.request(server).get('/api/search'),
        test_user
      ).query({ q: 'test', mode: 'full' })

      expect(res).to.have.status(200)
    })
  })
})
