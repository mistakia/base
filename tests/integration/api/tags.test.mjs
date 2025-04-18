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
  let test_tag_id
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

  describe('POST /api/tags', () => {
    it('should create a new tag', async () => {
      const tag_data = {
        title: 'Test Tag',
        description: 'A test tag',
        color: '#FF5733'
      }

      const res = await authenticate_request(
        chai.request(server).post('/api/tags').send(tag_data),
        test_user
      )

      expect(res).to.have.status(201)
      expect(res.body).to.be.an('object')
      expect(res.body.title).to.equal(tag_data.title)
      expect(res.body.description).to.equal(tag_data.description)
      expect(res.body.color).to.equal(tag_data.color)
      expect(res.body.tag_id).to.be.a('string')

      test_tag_id = res.body.tag_id
    })

    it('should return 400 if title is missing', async () => {
      const res = await authenticate_request(
        chai
          .request(server)
          .post('/api/tags')
          .send({ description: 'Missing title' }),
        test_user
      )

      expect(res).to.have.status(400)
      expect(res.body).to.have.property('error')
      expect(res.body.error).to.equal('Tag title is required')
    })

    it('should return 409 if tag with same title already exists', async () => {
      const tag_data = {
        title: 'Test Tag', // Same as previously created
        description: 'This should conflict'
      }

      const res = await authenticate_request(
        chai.request(server).post('/api/tags').send(tag_data),
        test_user
      )

      expect(res).to.have.status(409)
      expect(res.body).to.have.property('error')
      expect(res.body).to.have.property('tag_id')
      expect(res.body.tag_id).to.equal(test_tag_id)
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

  describe('PUT /api/tags/{tag_id}', () => {
    it('should update a tag', async () => {
      const update_data = {
        title: 'Updated Test Tag',
        description: 'Updated description',
        color: '#33FF57'
      }

      const res = await authenticate_request(
        chai.request(server).put(`/api/tags/${test_tag_id}`).send(update_data),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body).to.be.an('object')
      expect(res.body.title).to.equal(update_data.title)
      expect(res.body.description).to.equal(update_data.description)
      expect(res.body.color).to.equal(update_data.color)
    })

    it('should return 404 for non-existent tag', async () => {
      const fake_id = '00000000-0000-0000-0000-000000000000'
      const res = await authenticate_request(
        chai
          .request(server)
          .put(`/api/tags/${fake_id}`)
          .send({ title: 'Wont Update' }),
        test_user
      )

      expect(res).to.have.status(404)
      expect(res.body).to.have.property('error')
      expect(res.body.error).to.equal('Tag not found')
    })
  })

  describe('POST /api/tags/{tag_id}/entities/{entity_id}', () => {
    it('should tag an entity', async () => {
      const res = await authenticate_request(
        chai
          .request(server)
          .post(`/api/tags/${test_tag_id}/entities/${test_entity_id}`),
        test_user
      )

      expect(res).to.have.status(204)
    })

    it('should return 404 for non-existent tag', async () => {
      const fake_id = '00000000-0000-0000-0000-000000000000'
      const res = await authenticate_request(
        chai
          .request(server)
          .post(`/api/tags/${fake_id}/entities/${test_entity_id}`),
        test_user
      )

      expect(res).to.have.status(404)
      expect(res.body).to.have.property('error')
      expect(res.body.error).to.equal('Tag or entity not found')
    })

    it('should return 404 for non-existent entity', async () => {
      const fake_id = '00000000-0000-0000-0000-000000000000'
      const res = await authenticate_request(
        chai
          .request(server)
          .post(`/api/tags/${test_tag_id}/entities/${fake_id}`),
        test_user
      )

      expect(res).to.have.status(404)
      expect(res.body).to.have.property('error')
      expect(res.body.error).to.equal('Tag or entity not found')
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

  describe('DELETE /api/tags/{tag_id}/entities/{entity_id}', () => {
    it('should untag an entity', async () => {
      const res = await authenticate_request(
        chai
          .request(server)
          .delete(`/api/tags/${test_tag_id}/entities/${test_entity_id}`),
        test_user
      )

      expect(res).to.have.status(204)

      // Verify the entity is no longer tagged
      const tag_res = await authenticate_request(
        chai.request(server).get('/api/tags/Updated Test Tag'),
        test_user
      )

      expect(tag_res.body.tasks).to.have.length(0)
    })
  })

  describe('DELETE /api/tags/{tag_id}', () => {
    it('should delete a tag', async () => {
      const res = await authenticate_request(
        chai.request(server).delete(`/api/tags/${test_tag_id}`),
        test_user
      )

      expect(res).to.have.status(204)

      // Verify the tag no longer exists
      const get_res = await authenticate_request(
        chai.request(server).get('/api/tags/Updated Test Tag'),
        test_user
      )

      expect(get_res).to.have.status(404)
    })

    it('should return 404 for non-existent tag', async () => {
      const fake_id = '00000000-0000-0000-0000-000000000000'
      const res = await authenticate_request(
        chai.request(server).delete(`/api/tags/${fake_id}`),
        test_user
      )

      expect(res).to.have.status(404)
      expect(res.body).to.have.property('error')
      expect(res.body.error).to.equal('Tag not found')
    })
  })
})
