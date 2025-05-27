/* global describe it before beforeEach */
import chai from 'chai'
import chaiHttp from 'chai-http'

import db from '#db'
import server from '#server'
import { create_test_user } from '#tests/utils/index.mjs'
import create_test_task from '#tests/utils/create-test-task.mjs'
import reset_all_tables from '#tests/utils/reset-all-tables.mjs'

chai.should()
chai.use(chaiHttp)

describe('API /:user_id/tasks GET', () => {
  let user
  let task_entity_id
  let task_base_relative_path
  let root_base_repo

  before(async () => {
    await reset_all_tables()
    user = await create_test_user()
  })

  beforeEach(async () => {
    // Create a test task before each test
    const {
      task_entity_id: entity_id,
      base_relative_path,
      root_base_repo: repo
    } = await create_test_task({
      user_id: user.user_id,
      title: 'Test Task',
      description: 'A task for testing',
      finish_by: new Date('2023-01-01')
    })

    task_entity_id = entity_id
    task_base_relative_path = base_relative_path
    root_base_repo = repo
  })

  describe('GET /', () => {
    it('should get all tasks for a user', async () => {
      const res = await chai
        .request(server)
        .get(`/api/users/${user.user_id}/tasks`)

      res.should.have.status(200)
      res.body.should.be.an('array')
      res.body.length.should.be.at.least(1)

      // Check first task has expected properties
      const task = res.body[0]
      task.should.have.property('base_relative_path')
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

    it('should filter tasks by status', async () => {
      // First, let's make sure our task has a specific status
      await db('tasks')
        .where('entity_id', task_entity_id)
        .update({ status: 'Waiting' })

      const res = await chai
        .request(server)
        .get(`/api/users/${user.user_id}/tasks`)
        .query({
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

  describe('GET /:base_relative_path', () => {
    it('should get a specific task by base_relative_path', async () => {
      const res = await chai
        .request(server)
        .get(
          `/api/users/${user.user_id}/tasks/${task_base_relative_path}?root_base_directory=${root_base_repo.path}`
        )

      res.should.have.status(200)
      res.body.should.be.an('object')
      res.body.should.have.property('base_relative_path')
      res.body.base_relative_path.should.equal(task_base_relative_path)
      res.body.should.have.property('title')
      res.body.should.have.property('description')
      res.body.should.have.property('user_id')
      res.body.should.have.property('created_at')
      res.body.should.have.property('updated_at')
      res.body.should.have.property('status')
      res.body.should.have.property('priority')
      res.body.should.have.property('finish_by')

      // TODO
    })

    it('should return 404 for non-existent base_relative_path', async () => {
      const non_existent_path = 'user/non-existent-task'
      const res = await chai
        .request(server)
        .get(
          `/api/users/${user.user_id}/tasks/${non_existent_path}?root_base_directory=${root_base_repo.path}`
        )

      res.should.have.status(404)
      res.body.should.have.property('error')
      res.body.error.should.equal(`Task '${non_existent_path}' does not exist`)
    })
  })
})
