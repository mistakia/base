import chai, { expect } from 'chai'
import jwt from 'jsonwebtoken'
import crypto, { randomUUID } from 'crypto'

import { request } from '#tests/utils/test-request.mjs'
import server from '#server'
import config from '#config'
import { reset_all_tables } from '#tests/utils/index.mjs'
import ed25519 from '#libs-server/crypto/ed25519-blake2b.mjs'
import user_registry from '#libs-server/users/user-registry.mjs'

chai.should()

describe('API /users', () => {
  let user_data
  let user_private_key
  let user_public_key
  let auth_token

  before(async () => {
    await reset_all_tables()

    // Create keys for a test user
    user_private_key = crypto.randomBytes(32)
    user_public_key = ed25519.publicKey(user_private_key)

    const username = 'testuser_' + Date.now().toString(36)

    user_data = {
      user_public_key: user_public_key.toString('hex'),
      username,
      email: 'test@example.com'
    }

    // Create identity entity for access control
    const create_user = (await import('#libs-server/users/create-user.mjs'))
      .default
    await create_user({
      username,
      email: 'test@example.com',
      user_private_key
    })
    user_registry._clear_cache()
  })

  it('should authenticate an authorized user', async () => {
    // Include timestamp and nonce for replay protection
    const auth_data = {
      ...user_data,
      timestamp: Date.now(),
      nonce: randomUUID()
    }

    const data_hash = ed25519.hash(JSON.stringify(auth_data))
    const auth_signature = ed25519
      .sign(data_hash, user_private_key, user_public_key)
      .toString('hex')

    const res = await request(server).post('/api/users').send({
      data: auth_data,
      signature: auth_signature
    })

    expect(res.status).to.equal(200)
    res.body.should.be.a('object')
    res.body.should.have.property('token')
    res.body.should.have.property('user_public_key')
    res.body.should.have.property('username')
    res.body.username.should.equal(user_data.username)
    res.body.user_public_key.should.equal(user_data.user_public_key)

    // Store for future tests
    auth_token = res.body.token

    // Verify token is a valid JWT
    const decoded = jwt.verify(res.body.token, config.jwt.secret)
    decoded.should.have.property('user_public_key')
    decoded.user_public_key.should.equal(user_data.user_public_key)
  })

  it('should get a user by username', async () => {
    const res = await request(server)
      .get(`/api/users/${user_data.username}`)
      .set('Authorization', `Bearer ${auth_token}`)

    expect(res.status).to.equal(200)
    res.body.should.be.a('object')
    res.body.should.have.property('user_public_key')
    res.body.should.have.property('username')
    res.body.should.have.property('created_at')

    res.body.username.should.equal(user_data.username)
    res.body.user_public_key.should.equal(user_data.user_public_key)
  })

  it('should get a user by user_public_key', async () => {
    const res = await request(server)
      .get(`/api/users/public_keys/${user_data.user_public_key}`)

    expect(res.status).to.equal(200)
    res.body.should.be.a('object')
    res.body.should.have.property('username')
    res.body.should.have.property('created_at')
    res.body.should.not.have.property('permissions')

    res.body.username.should.equal(user_data.username)
  })

  it('should create a session and return JWT token', async () => {
    const session_data = {
      user_public_key: user_data.user_public_key,
      timestamp: Date.now(),
      nonce: randomUUID()
    }

    const data_hash = ed25519.hash(JSON.stringify(session_data))
    const session_signature = ed25519
      .sign(data_hash, user_private_key, user_public_key)
      .toString('hex')

    const res = await request(server).post('/api/users/session').send({
      data: session_data,
      signature: session_signature
    })

    expect(res.status).to.equal(200)
    res.body.should.be.a('object')
    res.body.should.have.property('token')
    res.body.should.have.property('user_public_key')
    res.body.should.have.property('username')

    res.body.user_public_key.should.equal(user_data.user_public_key)
    res.body.username.should.equal(user_data.username)

    // Verify token is a valid JWT
    const decoded = jwt.verify(res.body.token, config.jwt.secret)
    decoded.should.have.property('user_public_key')
    decoded.user_public_key.should.equal(user_data.user_public_key)
  })
})
