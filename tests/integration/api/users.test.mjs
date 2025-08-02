import chai from 'chai'
import chaiHttp from 'chai-http'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

import server from '#server'
import config from '#config'
import { reset_all_tables } from '#tests/utils/index.mjs'
import ed25519 from '@trashman/ed25519-blake2b'

chai.should()
chai.use(chaiHttp)

describe('API /users', () => {
  let user_data
  let private_key
  let public_key
  let signature
  let user_id
  // let timestamp
  let auth_token

  before(async () => {
    await reset_all_tables()
    // timestamp = new Date()

    // Create keys for a test user
    private_key = crypto.randomBytes(32)
    public_key = ed25519.publicKey(private_key)

    user_data = {
      public_key: public_key.toString('hex'),
      username: 'testuser_' + Date.now().toString(36),
      email: 'test@example.com'
    }

    const data_hash = ed25519.hash(JSON.stringify(user_data))
    signature = ed25519.sign(data_hash, private_key, public_key).toString('hex')
  })

  it('should create a new user', async () => {
    const res = await chai.request(server).post('/api/users').send({
      data: user_data,
      signature
    })

    res.should.have.status(200)
    res.body.should.be.a('object')
    res.body.should.have.property('token')
    res.body.should.have.property('user_id')
    res.body.should.have.property('public_key')
    res.body.should.have.property('username')
    res.body.should.have.property('email')
    res.body.username.should.equal(user_data.username)
    res.body.public_key.should.equal(user_data.public_key)
    res.body.email.should.equal(user_data.email)

    // Store for future tests
    user_id = res.body.user_id
    auth_token = res.body.token

    // Verify token is a valid JWT
    const decoded = jwt.verify(res.body.token, config.jwt.secret)
    decoded.should.have.property('user_id')
    decoded.user_id.should.equal(user_id)
  })

  it('should get a user by username', async () => {
    const res = await chai
      .request(server)
      .get(`/api/users/${user_data.username}`)
      .set('Authorization', `Bearer ${auth_token}`)

    res.should.have.status(200)
    res.body.should.be.a('object')
    res.body.should.have.property('user_id')
    res.body.should.have.property('public_key')
    res.body.should.have.property('username')
    res.body.should.have.property('email')
    res.body.should.have.property('created_at')
    res.body.should.have.property('updated_at')

    res.body.user_id.should.equal(user_id)
    res.body.username.should.equal(user_data.username)
    res.body.public_key.should.equal(user_data.public_key)
    res.body.email.should.equal(user_data.email)
  })

  it('should get a user by public_key', async () => {
    const res = await chai
      .request(server)
      .get(`/api/users/public_keys/${user_data.public_key}`)

    res.should.have.status(200)
    res.body.should.be.a('object')
    res.body.should.have.property('user_id')
    res.body.should.have.property('public_key')
    res.body.should.have.property('username')
    res.body.should.have.property('email')
    res.body.should.have.property('created_at')
    res.body.should.have.property('updated_at')

    res.body.user_id.should.equal(user_id)
    res.body.username.should.equal(user_data.username)
    res.body.public_key.should.equal(user_data.public_key)
    res.body.email.should.equal(user_data.email)
  })

  it('should create a session and return JWT token', async () => {
    const session_data = {
      public_key: user_data.public_key,
      timestamp: Date.now()
    }

    const data_hash = ed25519.hash(JSON.stringify(session_data))
    const session_signature = ed25519
      .sign(data_hash, private_key, public_key)
      .toString('hex')

    const res = await chai.request(server).post('/api/users/session').send({
      data: session_data,
      signature: session_signature
    })

    res.should.have.status(200)
    res.body.should.be.a('object')
    res.body.should.have.property('token')
    res.body.should.have.property('user_id')
    res.body.should.have.property('public_key')
    res.body.should.have.property('username')
    res.body.should.have.property('email')

    res.body.user_id.should.equal(user_id)
    res.body.public_key.should.equal(user_data.public_key)
    res.body.username.should.equal(user_data.username)
    res.body.email.should.equal(user_data.email)

    // Verify token is a valid JWT
    const decoded = jwt.verify(res.body.token, config.jwt.secret)
    decoded.should.have.property('user_id')
    decoded.user_id.should.equal(user_id)
  })
})
