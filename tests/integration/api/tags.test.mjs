import chai, { expect } from 'chai'
import chaiHttp from 'chai-http'
import server from '#server'
import {
  reset_all_tables,
  create_test_user,
  create_test_tag,
  authenticate_request,
  create_temp_test_repo,
  setup_api_test_registry
} from '#tests/utils/index.mjs'

chai.use(chaiHttp)

describe('Tags API', () => {
  let test_user
  let test_repo
  let registry_cleanup
  const cleanup_tasks = []

  before(async () => {
    await reset_all_tables()

    // Set up temporary repo for filesystem operations
    test_repo = await create_temp_test_repo()

    // Setup registry BEFORE create_test_user so identity file
    // is written to the test repo's user_path
    registry_cleanup = setup_api_test_registry({
      system_base_directory: test_repo.system_path,
      user_base_directory: test_repo.user_path
    })

    test_user = await create_test_user()
  })

  after(async () => {
    // Run cleanup functions
    for (const cleanup of cleanup_tasks) {
      await cleanup()
    }

    // Clean up registry
    if (registry_cleanup) {
      registry_cleanup()
    }

    // Clean up the test repo
    if (test_repo && test_repo.cleanup) {
      test_repo.cleanup()
    }

    await reset_all_tables()
  })

  describe('GET /api/tags', () => {
    it('should return an empty array when no tags exist', async () => {
      const res = await authenticate_request(
        chai.request(server).get('/api/tags'),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body).to.be.an('array')
      expect(res.body).to.have.length(0)
    })
  })

  describe('GET /api/tags', () => {
    it('should get a tag and its associated entities', async () => {
      const { base_uri, cleanup } = await create_test_tag({
        title: 'Test Tag',
        user_public_key: test_user.user_public_key
      })
      cleanup_tasks.push(cleanup)

      const res = await authenticate_request(
        chai.request(server).get('/api/tags').query({ base_uri }),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body).to.be.an('object')
      expect(res.body.tag).to.be.an('object')
      expect(res.body.tag.entity_properties.title).to.equal('Test Tag')
      expect(res.body.entities).to.be.an('array')
    })

    it('should return 404 for non-existent tag', async () => {
      const res = await authenticate_request(
        chai
          .request(server)
          .get('/api/tags')
          .query({ base_uri: 'sys:tag/NonExistentTag.md' }),
        test_user
      )

      expect(res).to.have.status(404)
      expect(res.body).to.have.property('error')
      expect(res.body.error).to.include(
        'Tag sys:tag/NonExistentTag.md not found'
      )
    })
  })
})
