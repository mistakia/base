/* global describe it before beforeEach afterEach */
import chai, { expect } from 'chai'

import server from '#server'
import { request } from '#tests/utils/test-request.mjs'
import {
  create_test_user,
  setup_api_test_registry,
  create_auth_token
} from '#tests/utils/index.mjs'
import create_test_task from '#tests/utils/create-test-task.mjs'
import reset_all_tables from '#tests/utils/reset-all-tables.mjs'
import { TASK_STATUS, TASK_PRIORITY } from '#libs-shared/task-constants.mjs'

chai.should()

describe('API /tasks PATCH', () => {
  let owner_user
  let other_user
  let task_base_uri
  let test_directories
  let registry_cleanup

  before(async () => {
    await reset_all_tables()
    owner_user = await create_test_user()
    owner_user.jwt_token = create_auth_token(owner_user)

    other_user = await create_test_user()
    other_user.jwt_token = create_auth_token(other_user)
  })

  beforeEach(async () => {
    const { base_uri, test_directories: directories } = await create_test_task({
      user_public_key: owner_user.user_public_key,
      title: 'Test Task for PATCH',
      description: 'A task for testing PATCH endpoint',
      status: TASK_STATUS.NO_STATUS,
      priority: TASK_PRIORITY.NONE
    })

    task_base_uri = base_uri
    test_directories = directories

    registry_cleanup = setup_api_test_registry({
      system_base_directory: directories.system_path,
      user_base_directory: directories.user_path
    })
  })

  afterEach(async () => {
    if (registry_cleanup) {
      registry_cleanup()
    }

    if (test_directories && test_directories.cleanup) {
      test_directories.cleanup()
    }
  })

  describe('successful updates', () => {
    it('should update task status with valid owner', async () => {
      const res = await request(server)
        .patch('/api/tasks')
        .set('Authorization', `Bearer ${owner_user.jwt_token}`)
        .send({
          base_uri: task_base_uri,
          properties: { status: TASK_STATUS.IN_PROGRESS }
        })

      expect(res.status).to.equal(200)
      res.body.should.have.property('success', true)
      res.body.should.have.property('base_uri', task_base_uri)
      res.body.should.have.property('updated_properties')
      res.body.updated_properties.should.have.property(
        'status',
        TASK_STATUS.IN_PROGRESS
      )
    })

    it('should update task priority with valid owner', async () => {
      const res = await request(server)
        .patch('/api/tasks')
        .set('Authorization', `Bearer ${owner_user.jwt_token}`)
        .send({
          base_uri: task_base_uri,
          properties: { priority: TASK_PRIORITY.HIGH }
        })

      expect(res.status).to.equal(200)
      res.body.should.have.property('success', true)
      res.body.should.have.property('base_uri', task_base_uri)
      res.body.should.have.property('updated_properties')
      res.body.updated_properties.should.have.property(
        'priority',
        TASK_PRIORITY.HIGH
      )
    })

    it('should update both status and priority', async () => {
      const res = await request(server)
        .patch('/api/tasks')
        .set('Authorization', `Bearer ${owner_user.jwt_token}`)
        .send({
          base_uri: task_base_uri,
          properties: {
            status: TASK_STATUS.COMPLETED,
            priority: TASK_PRIORITY.CRITICAL
          }
        })

      expect(res.status).to.equal(200)
      res.body.should.have.property('success', true)
      res.body.updated_properties.should.have.property(
        'status',
        TASK_STATUS.COMPLETED
      )
      res.body.updated_properties.should.have.property(
        'priority',
        TASK_PRIORITY.CRITICAL
      )
    })
  })

  describe('permission errors', () => {
    it('should return 403 for non-owner', async () => {
      const res = await request(server)
        .patch('/api/tasks')
        .set('Authorization', `Bearer ${other_user.jwt_token}`)
        .send({
          base_uri: task_base_uri,
          properties: { status: TASK_STATUS.IN_PROGRESS }
        })

      expect(res.status).to.equal(403)
      res.body.should.have.property('error', 'Permission denied')
    })

    it('should return 401 for unauthenticated request', async () => {
      const res = await request(server)
        .patch('/api/tasks')
        .send({
          base_uri: task_base_uri,
          properties: { status: TASK_STATUS.IN_PROGRESS }
        })

      expect(res.status).to.equal(401)
      res.body.should.have.property('error', 'Authentication required')
    })
  })

  describe('expanded field updates', () => {
    it('should update tags with valid array', async () => {
      const res = await request(server)
        .patch('/api/tasks')
        .set('Authorization', `Bearer ${owner_user.jwt_token}`)
        .send({
          base_uri: task_base_uri,
          properties: { tags: ['user:tag/foo.md', 'user:tag/bar.md'] }
        })

      expect(res.status).to.equal(200)
      res.body.should.have.property('success', true)
      res.body.updated_properties.should.have.property('tags')
      res.body.updated_properties.tags.should.deep.equal([
        'user:tag/foo.md',
        'user:tag/bar.md'
      ])
    })

    it('should update description field', async () => {
      const res = await request(server)
        .patch('/api/tasks')
        .set('Authorization', `Bearer ${owner_user.jwt_token}`)
        .send({
          base_uri: task_base_uri,
          properties: { description: 'Updated description' }
        })

      expect(res.status).to.equal(200)
      res.body.should.have.property('success', true)
      res.body.updated_properties.should.have.property(
        'description',
        'Updated description'
      )
    })

    it('should update multiple expanded fields at once', async () => {
      const res = await request(server)
        .patch('/api/tasks')
        .set('Authorization', `Bearer ${owner_user.jwt_token}`)
        .send({
          base_uri: task_base_uri,
          properties: {
            status: TASK_STATUS.IN_PROGRESS,
            tags: ['user:tag/test.md'],
            description: 'New description'
          }
        })

      expect(res.status).to.equal(200)
      res.body.should.have.property('success', true)
      res.body.updated_properties.should.have.property(
        'status',
        TASK_STATUS.IN_PROGRESS
      )
      res.body.updated_properties.should.have.property('tags')
      res.body.updated_properties.should.have.property(
        'description',
        'New description'
      )
    })

    it('should return 400 when tags is not an array', async () => {
      const res = await request(server)
        .patch('/api/tasks')
        .set('Authorization', `Bearer ${owner_user.jwt_token}`)
        .send({
          base_uri: task_base_uri,
          properties: { tags: 'not-an-array' }
        })

      expect(res.status).to.equal(400)
      res.body.should.have.property('error', 'tags must be an array')
    })

    it('should return 400 when relations is not an array', async () => {
      const res = await request(server)
        .patch('/api/tasks')
        .set('Authorization', `Bearer ${owner_user.jwt_token}`)
        .send({
          base_uri: task_base_uri,
          properties: { relations: 'not-an-array' }
        })

      expect(res.status).to.equal(400)
      res.body.should.have.property('error', 'relations must be an array')
    })

    it('should return 400 when observations is not an array', async () => {
      const res = await request(server)
        .patch('/api/tasks')
        .set('Authorization', `Bearer ${owner_user.jwt_token}`)
        .send({
          base_uri: task_base_uri,
          properties: { observations: 'not-an-array' }
        })

      expect(res.status).to.equal(400)
      res.body.should.have.property('error', 'observations must be an array')
    })
  })

  describe('validation errors', () => {
    it('should return 400 for invalid status value', async () => {
      const res = await request(server)
        .patch('/api/tasks')
        .set('Authorization', `Bearer ${owner_user.jwt_token}`)
        .send({
          base_uri: task_base_uri,
          properties: { status: 'Invalid Status' }
        })

      expect(res.status).to.equal(400)
      res.body.should.have.property('error')
      res.body.error.should.include('Invalid status value')
    })

    it('should return 400 for invalid priority value', async () => {
      const res = await request(server)
        .patch('/api/tasks')
        .set('Authorization', `Bearer ${owner_user.jwt_token}`)
        .send({
          base_uri: task_base_uri,
          properties: { priority: 'Invalid Priority' }
        })

      expect(res.status).to.equal(400)
      res.body.should.have.property('error')
      res.body.error.should.include('Invalid priority value')
    })

    it('should return 400 for missing base_uri', async () => {
      const res = await request(server)
        .patch('/api/tasks')
        .set('Authorization', `Bearer ${owner_user.jwt_token}`)
        .send({
          properties: { status: TASK_STATUS.IN_PROGRESS }
        })

      expect(res.status).to.equal(400)
      res.body.should.have.property('error', 'base_uri is required')
    })

    it('should return 400 for missing properties object', async () => {
      const res = await request(server)
        .patch('/api/tasks')
        .set('Authorization', `Bearer ${owner_user.jwt_token}`)
        .send({
          base_uri: task_base_uri
        })

      expect(res.status).to.equal(400)
      res.body.should.have.property('error', 'properties object is required')
    })

    it('should return 400 for no valid properties', async () => {
      const res = await request(server)
        .patch('/api/tasks')
        .set('Authorization', `Bearer ${owner_user.jwt_token}`)
        .send({
          base_uri: task_base_uri,
          properties: { invalid_field: 'value' }
        })

      expect(res.status).to.equal(400)
      res.body.should.have.property('error')
      res.body.error.should.include('No valid properties to update')
    })

    it('should return 404 for non-existent task', async () => {
      const res = await request(server)
        .patch('/api/tasks')
        .set('Authorization', `Bearer ${owner_user.jwt_token}`)
        .send({
          base_uri: 'user:task/non-existent-task.md',
          properties: { status: TASK_STATUS.IN_PROGRESS }
        })

      expect(res.status).to.equal(404)
      res.body.should.have.property('error')
    })
  })
})
