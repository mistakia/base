/* global describe it before */
import chai from 'chai'
import chaiHttp from 'chai-http'
import ed25519 from '@trashman/ed25519-blake2b'

import db from '#db'
import server from '#server'
import { create_test_user } from '#tests/utils/index.mjs'
import reset_all_tables from '#tests/utils/reset_all_tables.mjs'

chai.should()
chai.use(chaiHttp)

describe('API /:user_id/tasks POST', () => {
  let user

  before(async () => {
    await reset_all_tables()
    user = await create_test_user()
  })

  it('should create a new task', async () => {
    const task = {
      text_input: 'Test Task finish by 2018-01-01'
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

    res.should.have.status(200)
    res.body.should.be.a('object')
    res.body.should.have.property('task_id')

    const task_id = res.body.task_id
    const task_from_db = await db('tasks').where('entity_id', task_id).first()

    task_from_db.should.be.a('object')
    task_from_db.should.have.property('entity_id')
    task_from_db.should.have.property('finish_by')
    task_from_db.should.have.property('estimated_total_duration')
    task_from_db.should.have.property('estimated_preparation_duration')
    task_from_db.should.have.property('estimated_execution_duration')
    task_from_db.should.have.property('estimated_cleanup_duration')
    task_from_db.should.have.property('actual_duration')
    task_from_db.should.have.property('planned_start')

    const entity_from_db = await db('entities')
      .where('entity_id', task_id)
      .first()

    entity_from_db.should.have.property('created_at')
    entity_from_db.should.have.property('updated_at')
    entity_from_db.should.have.property('title')
    entity_from_db.should.have.property('type')
    entity_from_db.should.have.property('description')
    entity_from_db.should.have.property('user_id')
    entity_from_db.user_id.should.equal(user.user_id)
    entity_from_db.type.should.equal('task')
    entity_from_db.title.should.equal('Test Task finish by 2018-01-01')
  })

  it('should create a task with explicit title and description', async () => {
    const task = {
      text_input: 'Raw input text',
      title: 'Custom Task Title',
      description: 'This is a detailed description of the task'
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

    res.should.have.status(200)
    res.body.should.be.a('object')
    res.body.should.have.property('task_id')

    const task_id = res.body.task_id
    const entity_from_db = await db('entities')
      .where('entity_id', task_id)
      .first()

    entity_from_db.title.should.equal('Custom Task Title')
    entity_from_db.description.should.equal(
      'This is a detailed description of the task'
    )
  })

  it('should return 400 when task is missing', async () => {
    const res = await chai
      .request(server)
      .post(`/api/users/${user.user_id}/tasks`)
      .send({
        signature: 'some-signature',
        user_id: user.user_id
      })

    res.should.have.status(400)
    res.body.should.have.property('error')
    res.body.error.should.equal('missing task')
  })

  it('should return 400 when signature is missing', async () => {
    const task = {
      text_input: 'Test Task'
    }

    const res = await chai
      .request(server)
      .post(`/api/users/${user.user_id}/tasks`)
      .send({
        task,
        user_id: user.user_id
      })

    res.should.have.status(400)
    res.body.should.have.property('error')
    res.body.error.should.equal('missing signature')
  })

  it('should return 400 for invalid user_id', async () => {
    const task = {
      text_input: 'Test Task'
    }
    const task_hash = ed25519.hash(JSON.stringify(task))
    const signature = ed25519.sign(task_hash, user.private_key, user.public_key)

    // Use a valid UUID format but one that doesn't exist in the database
    const invalid_uuid = '12345678-1234-1234-1234-123456789012'

    const res = await chai
      .request(server)
      .post(`/api/users/${invalid_uuid}/tasks`)
      .send({
        task,
        signature: signature.toString('hex'),
        user_id: invalid_uuid
      })

    res.should.have.status(400)
    res.body.should.have.property('error')
    res.body.error.should.equal('invalid user_id')
  })

  it('should return 400 for invalid signature', async () => {
    const task = {
      text_input: 'Test Task'
    }
    // Create a different user with different keys
    const another_user = await create_test_user()
    // Sign with another user's key to create an invalid signature
    const task_hash = ed25519.hash(JSON.stringify(task))
    const invalid_signature = ed25519.sign(
      task_hash,
      another_user.private_key,
      another_user.public_key
    )

    const res = await chai
      .request(server)
      .post(`/api/users/${user.user_id}/tasks`)
      .send({
        task,
        signature: invalid_signature.toString('hex'),
        user_id: user.user_id
      })

    res.should.have.status(400)
    res.body.should.have.property('error')
    res.body.error.should.equal('invalid signature')
  })
})
