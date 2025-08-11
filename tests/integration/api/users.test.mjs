import chai from 'chai'
import chaiHttp from 'chai-http'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

import server from '#server'
import config from '#config'
import { reset_all_tables } from '#tests/utils/index.mjs'
import ed25519 from '@trashman/ed25519-blake2b'
import user_registry from '#libs-server/users/user-registry.mjs'

chai.should()
chai.use(chaiHttp)

describe('API /users', () => {
  let user_data
  let private_key
  let public_key
  let signature
  let auth_token

  before(async () => {
    await reset_all_tables()

    // Create keys for a test user
    private_key = crypto.randomBytes(32)
    public_key = ed25519.publicKey(private_key)

    user_data = {
      public_key: public_key.toString('hex'),
      username: 'testuser_' + Date.now().toString(36),
      email: 'test@example.com'
    }

    // Add user to users.json for access control
    const users = await user_registry.load_users()
    users[user_data.public_key] = {
      username: user_data.username,
      created_at: new Date().toISOString(),
      permissions: {}
    }
    await user_registry.save_users(users)

    const data_hash = ed25519.hash(JSON.stringify(user_data))
    signature = ed25519.sign(data_hash, private_key, public_key).toString('hex')
  })

  it('should authenticate an authorized user', async () => {
    const res = await chai.request(server).post('/api/users').send({
      data: user_data,
      signature
    })

    res.should.have.status(200)
    res.body.should.be.a('object')
    res.body.should.have.property('token')
    res.body.should.have.property('public_key')
    res.body.should.have.property('username')
    res.body.username.should.equal(user_data.username)
    res.body.public_key.should.equal(user_data.public_key)

    // Store for future tests
    auth_token = res.body.token

    // Verify token is a valid JWT
    const decoded = jwt.verify(res.body.token, config.jwt.secret)
    decoded.should.have.property('public_key')
    decoded.public_key.should.equal(user_data.public_key)
  })

  it('should get a user by username', async () => {
    const res = await chai
      .request(server)
      .get(`/api/users/${user_data.username}`)
      .set('Authorization', `Bearer ${auth_token}`)

    res.should.have.status(200)
    res.body.should.be.a('object')
    res.body.should.have.property('public_key')
    res.body.should.have.property('username')
    res.body.should.have.property('created_at')

    res.body.username.should.equal(user_data.username)
    res.body.public_key.should.equal(user_data.public_key)
  })

  it('should get a user by public_key', async () => {
    const res = await chai
      .request(server)
      .get(`/api/users/public_keys/${user_data.public_key}`)

    res.should.have.status(200)
    res.body.should.be.a('object')
    res.body.should.have.property('username')
    res.body.should.have.property('created_at')
    res.body.should.have.property('permissions')

    res.body.username.should.equal(user_data.username)
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
    res.body.should.have.property('public_key')
    res.body.should.have.property('username')

    res.body.public_key.should.equal(user_data.public_key)
    res.body.username.should.equal(user_data.username)

    // Verify token is a valid JWT
    const decoded = jwt.verify(res.body.token, config.jwt.secret)
    decoded.should.have.property('public_key')
    decoded.public_key.should.equal(user_data.public_key)
  })
})
