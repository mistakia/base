import { expect } from 'chai'

import { request } from '#tests/utils/test-request.mjs'
import server from '#server'
import {
  create_test_user,
  create_temp_test_repo,
  authenticate_request,
  reset_all_tables
} from '#tests/utils/index.mjs'
import {
  initialize_sqlite_client,
  close_sqlite_connection
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { create_sqlite_schema } from '#libs-server/embedded-database-index/sqlite/sqlite-schema-definitions.mjs'

describe('Table search (/api/{threads,tasks}/table with q)', function () {
  this.timeout(20000)

  let test_user
  let test_directories

  before(async () => {
    await reset_all_tables()
    await close_sqlite_connection()
    await initialize_sqlite_client({ in_memory: true })
    await create_sqlite_schema()
    test_user = await create_test_user()
  })

  after(async () => {
    await close_sqlite_connection()
    await reset_all_tables()
  })

  beforeEach(async () => {
    const test_repo = await create_temp_test_repo({
      prefix: 'table-search-base-repo-',
      register_directories: true
    })
    test_directories = {
      system_path: test_repo.system_path,
      user_path: test_repo.user_path,
      cleanup: test_repo.cleanup
    }
  })

  afterEach(async () => {
    if (test_directories) test_directories.cleanup()
  })

  describe('POST /api/threads/table', () => {
    it('returns empty rows + empty highlights when q has no FTS matches', async () => {
      const response = await authenticate_request(
        request(server).post('/api/threads/table'),
        test_user
      ).send({
        table_state: { q: 'nonexistentterm' }
      })

      expect(response.status).to.equal(200)
      expect(response.body).to.have.property('rows')
      expect(response.body.rows).to.deep.equal([])
      expect(response.body.total_row_count).to.equal(0)
      expect(response.body).to.have.property('row_highlights')
      expect(response.body.row_highlights).to.deep.equal({})
    })

    it('treats sub-3-character q as no-search and returns the unfiltered baseline', async () => {
      const response = await authenticate_request(
        request(server).post('/api/threads/table'),
        test_user
      ).send({
        table_state: { q: 'ab' }
      })

      expect(response.status).to.equal(200)
      expect(response.body).to.have.property('rows')
      // No q filter applied -> server returns whatever baseline rows exist.
      // With an empty in-memory DB this is also [], but no row_highlights
      // payload is generated for the no-search path.
      expect(response.body.rows).to.deep.equal([])
    })

    it('treats whitespace-only q as no-search', async () => {
      const response = await authenticate_request(
        request(server).post('/api/threads/table'),
        test_user
      ).send({
        table_state: { q: '   ' }
      })

      expect(response.status).to.equal(200)
      expect(response.body).to.have.property('rows')
    })
  })

  describe('POST /api/tasks/table', () => {
    it('returns empty rows + empty highlights when q has no FTS matches', async () => {
      const response = await authenticate_request(
        request(server).post('/api/tasks/table'),
        test_user
      ).send({
        table_state: { q: 'nonexistentterm' }
      })

      expect(response.status).to.equal(200)
      expect(response.body).to.have.property('rows')
      expect(response.body.rows).to.deep.equal([])
      expect(response.body.total_row_count).to.equal(0)
      expect(response.body).to.have.property('row_highlights')
      expect(response.body.row_highlights).to.deep.equal({})
    })

    it('treats sub-3-character q as no-search', async () => {
      const response = await authenticate_request(
        request(server).post('/api/tasks/table'),
        test_user
      ).send({
        table_state: { q: 'ab' }
      })

      expect(response.status).to.equal(200)
      expect(response.body).to.have.property('rows')
    })
  })
})
