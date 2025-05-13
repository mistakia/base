import chai, { expect } from 'chai'
import chaiHttp from 'chai-http'
import server from '#server'
import {
  reset_all_tables,
  create_test_user,
  authenticate_request
} from '#tests/utils/index.mjs'
import db from '#db'

chai.use(chaiHttp)

describe('Tags API', () => {
  let test_user
  let test_entity_id

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()

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

  describe('GET /api/tags/{tag_name}', () => {
    it('should get a tag and its associated entities', async () => {
      const res = await authenticate_request(
        chai.request(server).get('/api/tags/Test Tag'),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body).to.be.an('object')
      expect(res.body.tag).to.be.an('object')
      expect(res.body.tag.title).to.equal('Test Tag')
      expect(res.body.tasks).to.be.an('array')
      expect(res.body.physical_items).to.be.an('array')
      expect(res.body.digital_items).to.be.an('array')
      expect(res.body.databases).to.be.an('array')
    })

    it('should return 404 for non-existent tag', async () => {
      const res = await authenticate_request(
        chai.request(server).get('/api/tags/NonExistentTag'),
        test_user
      )

      expect(res).to.have.status(404)
      expect(res.body).to.have.property('error')
      expect(res.body.error).to.equal('Tag not found')
    })
  })

  describe('GET /api/tags/{tag_name} after tagging', () => {
    it('should return the tagged entity', async () => {
      const res = await authenticate_request(
        chai.request(server).get('/api/tags/Updated Test Tag'),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body.tasks).to.be.an('array')
      expect(res.body.tasks).to.have.length(1)
      expect(res.body.tasks[0].entity_id).to.equal(test_entity_id)
    })
  })
})
