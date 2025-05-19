import chai, { expect } from 'chai'
import chaiHttp from 'chai-http'
import server from '#server'
import {
  reset_all_tables,
  create_test_user,
  create_test_tag,
  authenticate_request,
  create_temp_test_repo
} from '#tests/utils/index.mjs'
import db from '#db'

chai.use(chaiHttp)

describe('Tags API', () => {
  let test_user
  let test_entity_id
  let test_repo
  let root_base_directory
  const cleanup_tasks = []

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()
    
    // Set up temporary repo for filesystem operations
    test_repo = await create_temp_test_repo()
    root_base_directory = test_repo.path

    // Create a test entity for tagging tests
    const [entity] = await db('entities')
      .insert({
        title: 'Test Entity',
        description: 'For testing tag associations',
        user_id: test_user.user_id,
        type: 'task'
      })
      .returning('entity_id')

    // Create task extension record
    await db('tasks').insert({
      entity_id: entity.entity_id,
      status: 'No status'
    })

    test_entity_id = entity.entity_id
  })

  after(async () => {
    // Run cleanup functions
    for (const cleanup of cleanup_tasks) {
      await cleanup()
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

  describe('GET /api/tags/{base_relative_path}', () => {
    it('should get a tag and its associated entities', async () => {
      const { base_relative_path, cleanup } = await create_test_tag({
        title: 'Test Tag',
        filesystem: true,
        user_id: test_user.user_id,
        root_base_directory
      })
      cleanup_tasks.push(cleanup)

      const res = await authenticate_request(
        chai.request(server).get(`/api/tags/${base_relative_path}`).query({ root_base_directory }),
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
        chai.request(server).get('/api/tags/user/NonExistentTag').query({ root_base_directory }),
        test_user
      )

      expect(res).to.have.status(404)
      expect(res.body).to.have.property('error')
      expect(res.body.error).to.include('Tag user/NonExistentTag not found')
    })
  })
})
