import { expect } from 'chai'

import require_service_auth from '#server/middleware/require-service-auth.mjs'
import { mint_service_token } from '#libs-server/threads/lease-auth.mjs'

const make_res = () => {
  const res = {}
  res.status = (code) => {
    res._status = code
    return res
  }
  res.json = (body) => {
    res._body = body
    return res
  }
  return res
}

describe('server/middleware/require-service-auth', () => {
  it('rejects request with no Authorization header', () => {
    const req = { headers: {} }
    const res = make_res()
    let called = false
    require_service_auth(req, res, () => {
      called = true
    })
    expect(called).to.equal(false)
    expect(res._status).to.equal(401)
    expect(res._body.error).to.match(/service authentication/)
  })

  it('rejects malformed Authorization header', () => {
    const req = { headers: { authorization: 'Basic abc' } }
    const res = make_res()
    let called = false
    require_service_auth(req, res, () => {
      called = true
    })
    expect(called).to.equal(false)
    expect(res._status).to.equal(401)
  })

  it('rejects invalid token', () => {
    const req = { headers: { authorization: 'Bearer not-a-jwt' } }
    const res = make_res()
    let called = false
    require_service_auth(req, res, () => {
      called = true
    })
    expect(called).to.equal(false)
    expect(res._status).to.equal(401)
    expect(res._body.error).to.match(/invalid service token/)
  })

  it('attaches req.service and calls next() on valid token', () => {
    const token = mint_service_token({ machine_id: 'macbook' })
    const req = { headers: { authorization: `Bearer ${token}` } }
    const res = make_res()
    let called = false
    require_service_auth(req, res, () => {
      called = true
    })
    expect(called).to.equal(true)
    expect(req.service).to.deep.equal({
      machine_id: 'macbook',
      scope: 'lease'
    })
    expect(req.user).to.equal(undefined)
  })
})
