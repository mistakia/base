import { expect } from 'chai'
import chai from 'chai'
import chaiHttp from 'chai-http'
import crypto, { randomUUID } from 'crypto'

import server from '#server'
import { reset_all_tables } from '#tests/utils/index.mjs'
import ed25519 from '@trashman/ed25519-blake2b'
import user_registry from '#libs-server/users/user-registry.mjs'

chai.use(chaiHttp)

/**
 * Helper to create signed auth request data
 */
function create_signed_data({ user_public_key, user_private_key }) {
  const public_key_buf =
    user_public_key instanceof Buffer
      ? user_public_key
      : Buffer.from(user_public_key, 'hex')
  const data = {
    user_public_key:
      typeof user_public_key === 'string'
        ? user_public_key
        : user_public_key.toString('hex'),
    timestamp: Date.now(),
    nonce: randomUUID()
  }
  const data_hash = ed25519.hash(JSON.stringify(data))
  const signature = ed25519
    .sign(data_hash, user_private_key, public_key_buf)
    .toString('hex')
  return { data, signature }
}

/**
 * Extract a specific cookie from the set-cookie header
 */
function get_cookie(res, name) {
  const cookies = res.headers['set-cookie']
  if (!cookies) return null
  const cookie_str = Array.isArray(cookies)
    ? cookies.find((c) => c.startsWith(`${name}=`))
    : cookies.startsWith(`${name}=`)
      ? cookies
      : null
  return cookie_str || null
}

describe('Cookie-based JWT Authentication', function () {
  this.timeout(10000)

  let user_private_key
  let user_public_key
  let username
  let auth_token

  before(async () => {
    await reset_all_tables()

    user_private_key = crypto.randomBytes(32)
    user_public_key = ed25519.publicKey(user_private_key)

    username = 'cookie_test_' + Date.now().toString(36)
    const create_user = (await import('#libs-server/users/create-user.mjs'))
      .default
    await create_user({
      username,
      email: 'cookie-test@example.com',
      user_private_key
    })
    user_registry._clear_cache()

    // Establish session once to get token and avoid rate limiting
    const { data, signature } = create_signed_data({
      user_public_key,
      user_private_key
    })
    const res = await chai
      .request(server)
      .post('/api/users/session')
      .send({ data, signature })
    auth_token = res.body.token
  })

  it('should set base_token cookie on POST /api/users/session', async () => {
    const { data, signature } = create_signed_data({
      user_public_key,
      user_private_key
    })

    const res = await chai
      .request(server)
      .post('/api/users/session')
      .send({ data, signature })

    expect(res).to.have.status(200)
    expect(res.body).to.have.property('token')

    const cookie = get_cookie(res, 'base_token')
    expect(cookie).to.not.be.null
    expect(cookie).to.include('HttpOnly')
    expect(cookie).to.include('SameSite=Lax')
    expect(cookie).to.include('Path=/')

    // Cookie value should match the response token
    const cookie_value = cookie.split('=')[1].split(';')[0]
    expect(cookie_value).to.equal(res.body.token)
  })

  it('should set base_token cookie on POST /api/users (user creation)', async () => {
    const new_private_key = crypto.randomBytes(32)
    const new_public_key = ed25519.publicKey(new_private_key)
    const new_username = 'cookie_create_' + Date.now().toString(36)

    const create_user = (await import('#libs-server/users/create-user.mjs'))
      .default
    await create_user({
      username: new_username,
      email: 'cookie-create@example.com',
      user_private_key: new_private_key
    })
    user_registry._clear_cache()

    const { data, signature } = create_signed_data({
      user_public_key: new_public_key,
      user_private_key: new_private_key
    })

    const res = await chai
      .request(server)
      .post('/api/users')
      .send({ data, signature })

    expect(res).to.have.status(200)

    const cookie = get_cookie(res, 'base_token')
    expect(cookie).to.not.be.null
    expect(cookie).to.include('HttpOnly')
  })

  it('should authenticate via cookie when Authorization header is absent', async () => {
    const res = await chai
      .request(server)
      .get(`/api/users/${username}`)
      .set('Cookie', `base_token=${auth_token}`)

    expect(res).to.have.status(200)
    expect(res.body).to.have.property('username', username)
  })

  it('should reject invalid/tampered cookie (req.user = null)', async () => {
    const res = await chai
      .request(server)
      .get(`/api/users/${username}`)
      .set('Cookie', 'base_token=invalid.tampered.token')

    expect(res).to.have.status(200)
    // Should return filtered public data (no full profile fields like created_at with email)
    expect(res.body).to.have.property('username')
    expect(res.body).to.have.property('permissions')
  })

  it('should prefer Authorization header over cookie when both present', async () => {
    // Valid header + invalid cookie -- header should win
    const res = await chai
      .request(server)
      .get(`/api/users/${username}`)
      .set('Authorization', `Bearer ${auth_token}`)
      .set('Cookie', 'base_token=invalid.tampered.token')

    expect(res).to.have.status(200)
    expect(res.body).to.have.property('username', username)
  })

  it('should proceed without user when no cookie and no header present', async () => {
    const res = await chai.request(server).get(`/api/users/${username}`)

    expect(res).to.have.status(200)
    // Should return filtered public data only
    expect(res.body).to.have.property('username')
    expect(res.body).to.have.property('permissions')
  })

  it('should clear the cookie on DELETE /api/users/session', async () => {
    const res = await chai.request(server).delete('/api/users/session')

    expect(res).to.have.status(200)
    expect(res.body).to.deep.equal({ success: true })

    const cookie = get_cookie(res, 'base_token')
    expect(cookie).to.not.be.null
    // Cleared cookies have an expired date
    expect(cookie).to.match(/Expires=Thu, 01 Jan 1970/)
  })
})
