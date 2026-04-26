import { expect } from 'chai'
import jwt from 'jsonwebtoken'

import {
  mint_service_token,
  verify_service_token,
  get_service_token,
  ServiceTokenSecretMissing,
  _reset_cache_for_tests
} from '#libs-server/threads/lease-auth.mjs'
import config from '#config'

describe('libs-server/threads/lease-auth', function () {
  beforeEach(() => {
    _reset_cache_for_tests()
  })

  describe('mint_service_token', () => {
    it('produces an HS256 JWT with expected claims', () => {
      const token = mint_service_token({ machine_id: 'macbook' })
      const decoded = jwt.verify(token, config.service_token.secret, {
        algorithms: ['HS256'],
        audience: 'lease-api'
      })
      expect(decoded.sub).to.equal('service:macbook')
      expect(decoded.iss).to.equal('macbook')
      expect(decoded.aud).to.equal('lease-api')
      expect(decoded.scope).to.equal('lease')
      expect(decoded).to.not.have.property('user_public_key')
    })

    it('honours ttl_seconds', () => {
      const token = mint_service_token({
        machine_id: 'macbook',
        ttl_seconds: 5
      })
      const decoded = jwt.verify(token, config.service_token.secret, {
        algorithms: ['HS256'],
        audience: 'lease-api'
      })
      expect(decoded.exp - decoded.iat).to.equal(5)
    })

    it('throws when machine_id missing', () => {
      expect(() => mint_service_token({})).to.throw('machine_id required')
    })

    it('throws ServiceTokenSecretMissing when secret unset', () => {
      const original = config.service_token.secret
      config.service_token.secret = ''
      try {
        expect(() =>
          mint_service_token({ machine_id: 'macbook' })
        ).to.throw(ServiceTokenSecretMissing)
      } finally {
        config.service_token.secret = original
      }
    })
  })

  describe('verify_service_token', () => {
    it('roundtrips claims', () => {
      const token = mint_service_token({ machine_id: 'storage' })
      const claims = verify_service_token({ token })
      expect(claims.machine_id).to.equal('storage')
      expect(claims.scope).to.equal('lease')
      expect(claims.exp).to.be.a('number')
    })

    it('rejects tampered token', () => {
      const token = mint_service_token({ machine_id: 'storage' })
      const tampered = token.slice(0, -4) + 'XXXX'
      expect(() => verify_service_token({ token: tampered })).to.throw()
    })

    it('rejects token signed with a different secret', () => {
      const foreign = jwt.sign(
        { sub: 'service:macbook', aud: 'lease-api', scope: 'lease' },
        'wrong_secret',
        { algorithm: 'HS256', expiresIn: 60 }
      )
      expect(() => verify_service_token({ token: foreign })).to.throw()
    })

    it('rejects token with wrong audience', () => {
      const wrong_aud = jwt.sign(
        { sub: 'service:macbook', aud: 'other', scope: 'lease' },
        config.service_token.secret,
        { algorithm: 'HS256', expiresIn: 60 }
      )
      expect(() => verify_service_token({ token: wrong_aud })).to.throw()
    })

    it('rejects token without lease scope', () => {
      const wrong_scope = jwt.sign(
        { sub: 'service:macbook', aud: 'lease-api', scope: 'other' },
        config.service_token.secret,
        { algorithm: 'HS256', expiresIn: 60 }
      )
      expect(() =>
        verify_service_token({ token: wrong_scope })
      ).to.throw('lease scope')
    })

    it('rejects token with non-service sub', () => {
      const user_token = jwt.sign(
        {
          sub: 'user:abc',
          aud: 'lease-api',
          scope: 'lease',
          user_public_key: 'abc'
        },
        config.service_token.secret,
        { algorithm: 'HS256', expiresIn: 60 }
      )
      expect(() => verify_service_token({ token: user_token })).to.throw(
        'service:'
      )
    })

    it('rejects expired token', (done) => {
      const token = mint_service_token({
        machine_id: 'storage',
        ttl_seconds: 1
      })
      setTimeout(() => {
        try {
          expect(() => verify_service_token({ token })).to.throw(
            'jwt expired'
          )
          done()
        } catch (err) {
          done(err)
        }
      }, 1100)
    })
  })

  describe('get_service_token (cache)', () => {
    it('returns cached token within ttl', () => {
      const a = get_service_token({ machine_id: 'macbook' })
      const b = get_service_token({ machine_id: 'macbook' })
      expect(a).to.equal(b)
    })

    it('mints a new token when machine_id changes', () => {
      const a = get_service_token({ machine_id: 'macbook' })
      const b = get_service_token({ machine_id: 'storage' })
      expect(a).to.not.equal(b)
    })

    it('mints a new token when cached one is near expiry', (done) => {
      const a = get_service_token({ machine_id: 'macbook', ttl_seconds: 16 })
      setTimeout(() => {
        const b = get_service_token({
          machine_id: 'macbook',
          ttl_seconds: 16
        })
        try {
          expect(a).to.not.equal(b)
          done()
        } catch (err) {
          done(err)
        }
      }, 1500)
    }).timeout(5000)
  })
})
