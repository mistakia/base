/* global describe it before beforeEach */
import chai from 'chai'
import chaiHttp from 'chai-http'
import ed25519 from '@trashman/ed25519-blake2b'

import db from '#db'
import server from '#server'
import { create_test_user } from '#tests/utils/index.mjs'
import reset_all_tables from '#tests/utils/reset_all_tables.mjs'

const { expect } = chai
chai.should()
chai.use(chaiHttp)

describe('API /:user_id/tasks GET', () => {
  let user
  let task_id

  before(async () => {
    await reset_all_tables()
    user = await create_test_user()
  })

  beforeEach(async () => {
    // Create a test task before each test
    const task = {
      text_input: 'Test Task finish by 2023-01-01'
    }
    const task_hash = ed25519.hash(JSON.stringify(task))
    const signature = ed25519.sign(task_hash, user.private_key, user.public_key)

    const res = await chai
      .request(server)
      .post(`/api/users/${user.user_id}/tasks`)
      .send({
        task,
        signature: signature.toString('hex'),
        user_id: user.user_id
      })

    task_id = res.body.task_id
  })

  describe('GET /', () => {
    it('should get all tasks for a user', async () => {
      const res = await chai
        .request(server)
        .get(`/api/users/${user.user_id}/tasks`)
        .query({ user_id: user.user_id })

      res.should.have.status(200)
      res.body.should.be.an('array')
      res.body.length.should.be.at.least(1)

      // Check first task has expected properties
      const task = res.body[0]
      task.should.have.property('task_id')
      task.should.have.property('title')
      task.should.have.property('description')
      task.should.have.property('user_id')
      task.should.have.property('created_at')
      task.should.have.property('updated_at')
      task.should.have.property('status')
      task.should.have.property('priority')
      task.should.have.property('finish_by')
      task.user_id.should.equal(user.user_id)
    })

    it('should return 400 when user_id is missing', async () => {
      const res = await chai
        .request(server)
        .get(`/api/users/${user.user_id}/tasks`)
      // Not sending user_id in query

      res.should.have.status(400)
      res.body.should.have.property('error')
      res.body.error.should.equal('missing user_id')
    })

    it('should filter tasks by status', async () => {
      // First, let's make sure our task has a specific status
      await db('tasks')
        .where('entity_id', task_id)
        .update({ status: 'Waiting' })

      const res = await chai
        .request(server)
        .get(`/api/users/${user.user_id}/tasks`)
        .query({
          user_id: user.user_id,
          status: 'Waiting'
        })

      res.should.have.status(200)
      res.body.should.be.an('array')
      res.body.length.should.be.at.least(1)

      // All returned tasks should have the specified status
      res.body.forEach((task) => {
        task.status.should.equal('Waiting')
      })
    })
  })

  describe('GET /:task_id', () => {
    it('should get a specific task by id', async () => {
      const res = await chai
        .request(server)
        .get(`/api/users/${user.user_id}/tasks/${task_id}`)

      res.should.have.status(200)
      res.body.should.be.an('object')
      res.body.should.have.property('task_id')
      res.body.task_id.should.equal(task_id)
      res.body.should.have.property('title')
      res.body.should.have.property('description')
      res.body.should.have.property('user_id')
      res.body.should.have.property('created_at')
      res.body.should.have.property('updated_at')
      res.body.should.have.property('status')
      res.body.should.have.property('priority')
      res.body.should.have.property('finish_by')

      // Task should also have the related arrays
      res.body.should.have.property('tag_ids').that.is.an('array')
      res.body.should.have.property('organization_ids').that.is.an('array')
      res.body.should.have.property('person_ids').that.is.an('array')
    })

    it('should return 404 for non-existent task_id', async () => {
      const non_existent_id = '00000000-0000-0000-0000-000000000000'
      const res = await chai
        .request(server)
        .get(`/api/users/${user.user_id}/tasks/${non_existent_id}`)

      res.should.have.status(404)
      res.body.should.have.property('error')
      res.body.error.should.equal('task not found')
    })
  })
})
