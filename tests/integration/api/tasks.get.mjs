/* global describe it before beforeEach */
import chai from 'chai'
import chaiHttp from 'chai-http'

import server from '#server'
import {
  create_test_user,
  setup_api_test_registry
} from '#tests/utils/index.mjs'
import create_test_task from '#tests/utils/create-test-task.mjs'
import reset_all_tables from '#tests/utils/reset-all-tables.mjs'

chai.should()
chai.use(chaiHttp)

describe('API /:user_public_key/tasks GET', () => {
  let user
  // let task_entity_id
  let task_base_uri
  let test_directories
  let registry_cleanup

  before(async () => {
    await reset_all_tables()
    user = await create_test_user()
  })

  beforeEach(async () => {
    // Create a test task before each test
    const { base_uri, test_directories: directories } = await create_test_task({
      user_public_key: user.user_public_key,
      title: 'Test Task',
      description: 'A task for testing',
      finish_by: new Date('2023-01-01')
    })

    // task_entity_id = entity_id
    task_base_uri = base_uri
    test_directories = directories

    // Setup registry for API calls
    registry_cleanup = setup_api_test_registry({
      system_base_directory: directories.system_path,
      user_base_directory: directories.user_path
    })
  })

  describe('GET / (list tasks)', () => {
    it('should get all tasks for a user', async () => {
      const res = await chai
        .request(server)
        .get(`/api/users/${user.user_public_key}/tasks`)

      res.should.have.status(200)
      res.body.should.be.an('array')
      res.body.length.should.be.at.least(1)

      // Check first task has expected properties
      const task = res.body[0]
      task.should.have.nested.property('file_info.base_uri')
      task.should.have.nested.property('entity_properties.title')
      task.should.have.nested.property('entity_properties.description')
      task.should.have.nested.property('entity_properties.user_public_key')
      task.should.have.nested.property('entity_properties.created_at')
      task.should.have.nested.property('entity_properties.updated_at')
      task.should.have.nested.property('entity_properties.status')
      task.should.have.nested.property('entity_properties.priority')
      task.should.have.nested.property('entity_properties.finish_by')
      task.user_public_key.should.equal(user.user_public_key)
    })

    it('should filter tasks by status', async () => {
      // Create a task with specific status for testing
      await create_test_task({
        user_public_key: user.user_public_key,
        title: 'Waiting Task',
        description: 'A task with waiting status',
        status: 'Waiting'
      })

      const res = await chai
        .request(server)
        .get(`/api/users/${user.user_public_key}/tasks`)
        .query({
          status: 'Waiting'
        })

      res.should.have.status(200)
      res.body.should.be.an('array')
      res.body.length.should.be.at.least(1)

      // All returned tasks should have the specified status
      res.body.forEach((task) => {
        task.entity_properties.status.should.equal('Waiting')
      })
    })
  })

  describe('GET / (get specific task)', () => {
    it('should get a specific task by base_uri', async () => {
      const res = await chai
        .request(server)
        .get(`/api/users/${user.user_public_key}/tasks`)
        .query({ base_uri: task_base_uri })

      res.should.have.status(200)
      res.body.should.be.an('object')
      res.body.should.have.property('base_uri')
      res.body.base_uri.should.equal(task_base_uri)
      res.body.should.have.property('title')
      res.body.should.have.property('description')
      res.body.should.have.property('user_public_key')
      res.body.should.have.property('created_at')
      res.body.should.have.property('updated_at')
      res.body.should.have.property('status')
      res.body.should.have.property('priority')
      res.body.should.have.property('finish_by')

      // TODO
    })

    it('should return 404 for non-existent base_uri', async () => {
      const non_existent_base_uri = 'user:task/non-existent-task.md'
      const res = await chai
        .request(server)
        .get(`/api/users/${user.user_public_key}/tasks`)
        .query({ base_uri: non_existent_base_uri })

      res.should.have.status(404)
      res.body.should.have.property('error')
      res.body.error.should.include(
        `Task '${non_existent_base_uri}' does not exist`
      )
    })
  })

  afterEach(async () => {
    // Clean up registry
    if (registry_cleanup) {
      registry_cleanup()
    }

    // Clean up test directories
    if (test_directories && test_directories.cleanup) {
      test_directories.cleanup()
    }
  })
})
