import chai, { expect } from 'chai'
import chaiHttp from 'chai-http'
import jwt from 'jsonwebtoken'

import app from '#server'
import config from '#config'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

chai.use(chaiHttp)

describe('Resource API Integration Tests', () => {
  let test_user
  let auth_token

  before(async () => {
    await reset_all_tables()

    // Create test user
    test_user = await create_test_user()
    auth_token = jwt.sign({ user_id: test_user.user_id }, config.jwt.secret)
  })

  describe('GET /api/resource - Basic functionality', () => {
    it('should return 400 when base_uri is missing', async () => {
      const res = await chai.request(app).get('/api/resource')

      expect(res).to.have.status(400)
      expect(res.body).to.have.property('error')
      expect(res.body.error).to.include('Missing required parameter: base_uri')
    })

    it('should return 400 for invalid URI format', async () => {
      const test_cases = ['invalid', 'no-colon', ':empty-prefix', 'prefix:']

      for (const invalid_uri of test_cases) {
        const res = await chai
          .request(app)
          .get('/api/resource')
          .query({ base_uri: invalid_uri })

        expect(res).to.have.status(400)
        expect(res.body).to.have.property('error')
        expect(res.body.error).to.include('Invalid URI format')
      }
    })

    it('should return 404 for non-existent resource', async () => {
      const res = await chai
        .request(app)
        .get('/api/resource')
        .query({ base_uri: 'user:nonexistent-file.md' })

      expect(res).to.have.status(404)
      expect(res.body).to.have.property('error')
      expect(res.body.error).to.include('Failed to resolve resource')
    })

    it('should include usage information in error responses', async () => {
      const res = await chai.request(app).get('/api/resource')

      expect(res).to.have.status(400)
      expect(res.body).to.have.property('usage')
      expect(res.body.usage).to.have.property('directory')
      expect(res.body.usage).to.have.property('entity')
      expect(res.body.usage).to.have.property('file')
    })
  })

  describe('GET /api/resource - Function integration', () => {
    it('should properly handle URI validation', async () => {
      // Test that the function properly validates different URI formats
      const valid_uris = ['user:task/my-task.md']

      for (const uri of valid_uris) {
        const res = await chai
          .request(app)
          .get('/api/resource')
          .query({ base_uri: uri })

        // Even if file doesn't exist, it should pass URI validation (not 400)
        expect(res).to.not.have.status(400)
        // Will either be 404 (not found) or 403 (access denied) or 200 (success)
        expect([200, 403, 404]).to.include(res.status)
      }
    })

    it('should include proper error structure', async () => {
      const res = await chai
        .request(app)
        .get('/api/resource')
        .query({ base_uri: 'user:definitely-nonexistent-file.md' })

      expect([404, 403]).to.include(res.status)
      expect(res.body).to.have.property('error')
      expect(res.body.error).to.be.a('string')

      // Error structure may vary based on where the error occurs
      expect(res.body).to.be.an('object')
    })

    it('should handle authentication header processing', async () => {
      const res = await chai
        .request(app)
        .get('/api/resource')
        .set('Authorization', `Bearer ${auth_token}`)
        .query({ base_uri: 'user:nonexistent.md' })

      // Should process auth token even if file doesn't exist
      expect([404, 403]).to.include(res.status)
      expect(res.body).to.have.property('error')
    })
  })
})
