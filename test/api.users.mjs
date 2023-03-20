/* global describe it before */
import chai from 'chai'
import chaiHttp from 'chai-http'
import crypto from 'crypto'
import ed25519 from '@trashman/ed25519-blake2b'
import { fromBinaryUUID } from 'binary-uuid'

import server from '#server'
import db from '#db'
import reset_all_tables from './utils/reset_all_tables.mjs'

chai.should()
chai.use(chaiHttp)

describe('API /users', function () {
  before(async () => {
    await reset_all_tables()
  })

  it('should create a new user', async () => {
    const timestamp = Math.round(Date.now() / 1000) - 1000
    const private_key = crypto.randomBytes(32)
    const public_key = ed25519.publicKey(private_key)
    const data = {
      public_key: public_key.toString('hex'),
      username: 'test_user',
      email: 'test@test.com'
    }
    const data_hash = ed25519.hash(JSON.stringify(data))

    const signature = ed25519.sign(data_hash, private_key, public_key)

    const res = await chai
      .request(server)
      .post('/api/users')
      .send({
        data,
        signature: signature.toString('hex')
      })

    res.should.have.status(200)
    res.body.should.be.a('object')
    res.body.should.have.property('user_id')

    const user_id = res.body.user_id
    const user = await db('users').where('user_id', user_id).first()
    user.should.be.a('object')
    user.should.have.property('user_id')
    user.should.have.property('public_key')
    user.should.have.property('username')
    user.should.have.property('email')
    user.should.have.property('created_at')
    user.should.have.property('updated_at')

    user.public_key.should.equal(data.public_key)
    user.username.should.equal(data.username)
    user.email.should.equal(data.email)

    user.created_at.should.be.least(timestamp)
    user.updated_at.should.be.least(timestamp)
  })

  it('should get a user by user_id', async () => {
    const user = await db('users').first()
    const user_id = fromBinaryUUID(user.user_id)
    const res = await chai.request(server).get(`/api/users/${user_id}`)

    res.should.have.status(200)
    res.body.should.be.a('object')
    res.body.should.have.property('user_id')
    res.body.should.have.property('public_key')
    res.body.should.have.property('username')
    res.body.should.have.property('email')
    res.body.should.have.property('created_at')
    res.body.should.have.property('updated_at')

    res.body.user_id.should.equal(user_id)
    res.body.public_key.should.equal(user.public_key)
    res.body.username.should.equal(user.username)
    res.body.email.should.equal(user.email)
    res.body.created_at.should.equal(user.created_at)
    res.body.updated_at.should.equal(user.updated_at)
  })

  it('should get a user by public_key', async () => {
    const user = await db('users').first()
    const res = await chai
      .request(server)
      .get(`/api/users/public_keys/${user.public_key}`)

    res.should.have.status(200)
    res.body.should.be.a('object')
    res.body.should.have.property('user_id')
    res.body.should.have.property('public_key')
    res.body.should.have.property('username')
    res.body.should.have.property('email')
    res.body.should.have.property('created_at')
    res.body.should.have.property('updated_at')

    res.body.user_id.should.equal(fromBinaryUUID(user.user_id))
    res.body.public_key.should.equal(user.public_key)
    res.body.username.should.equal(user.username)
    res.body.email.should.equal(user.email)
    res.body.created_at.should.equal(user.created_at)
    res.body.updated_at.should.equal(user.updated_at)
  })
})
