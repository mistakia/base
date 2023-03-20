/* global describe it before */
import chai from 'chai'
import chaiHttp from 'chai-http'
import ed25519 from '@trashman/ed25519-blake2b'
import { fromBinaryUUID } from 'binary-uuid'

import db from '#db'
import server from '#server'
import { create_test_user } from '#test/utils/index.mjs'
import reset_all_tables from './utils/reset_all_tables.mjs'

chai.should()
chai.use(chaiHttp)

describe('API /:user_id/tasks POST', () => {
  before(async () => {
    await reset_all_tables()
  })

  it('should create a new task', async () => {
    const user = await create_test_user()
    const task = {
      text_input: 'Test Task',
      deadline_text_input: '2018-01-01'
    }
    const task_hash = ed25519.hash(JSON.stringify(task))
    const signature = ed25519.sign(task_hash, user.private_key, user.public_key)

    const res = await chai
      .request(server)
      .post(`/api/${fromBinaryUUID(user.user_id)}/tasks`)
      .send({
        task,
        signature: signature.toString('hex')
      })

    res.should.have.status(200)
    res.body.should.be.a('object')
    res.body.should.have.property('task_id')

    const task_id = res.body.task_id
    const task_from_db = await db('tasks').where('task_id', task_id).first()
    task_from_db.should.be.a('object')
    task_from_db.should.have.property('task_id')
    task_from_db.should.have.property('user_id')
    task_from_db.should.have.property('text_input')
    task_from_db.should.have.property('deadline_text_input')
    task_from_db.should.have.property('deadline')
    task_from_db.should.have.property('created_at')
    task_from_db.should.have.property('updated_at')
    task_from_db.should.have.property('estimated_total_duration')
    task_from_db.should.have.property('estimated_preparation_duration')
    task_from_db.should.have.property('estimated_execution_duration')
    task_from_db.should.have.property('estimated_cleanup_duration')
    task_from_db.should.have.property('actual_duration')
    task_from_db.should.have.property('planned_start')
  })
})
