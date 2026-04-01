/**
 * Integration tests for GitHub webhook endpoint
 */

import { expect } from 'chai'
import { request } from '#tests/utils/test-request.mjs'
import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'

import server from '#server'
import config from '#config'
import {
  reset_all_tables,
  create_test_user,
  create_temp_test_repo,
  setup_api_test_registry
} from '#tests/utils/index.mjs'

// Helper to generate GitHub webhook signature
const generate_webhook_signature = (payload) => {
  const secret =
    config.github?.webhook_secret || 'test_webhook_secret_for_testing'
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const hmac = crypto.createHmac('sha256', secret)
  return 'sha256=' + hmac.update(body).digest('hex')
}

describe('GitHub Webhooks API', () => {
  let test_repo
  let registry_cleanup

  before(async () => {
    await reset_all_tables()
    await create_test_user()

    // Set up temporary repo for filesystem operations
    test_repo = await create_temp_test_repo()

    // Create github task directory
    await fs.mkdir(
      path.join(test_repo.user_path, 'task', 'github', 'test-org', 'test-repo'),
      {
        recursive: true
      }
    )

    // Setup registry for API calls
    registry_cleanup = setup_api_test_registry({
      system_base_directory: test_repo.system_path,
      user_base_directory: test_repo.user_path
    })
  })

  after(async () => {
    if (registry_cleanup) {
      registry_cleanup()
    }

    if (test_repo && test_repo.cleanup) {
      test_repo.cleanup()
    }

    await reset_all_tables()
  })

  describe('POST /api/github/webhooks', () => {
    describe('ping event', () => {
      it('should respond with pong for ping event', async () => {
        const payload = { zen: 'Test ping' }
        const signature = generate_webhook_signature(payload)
        const res = await request(server)
          .post('/api/github/webhooks')
          .set('x-github-event', 'ping')
          .set('x-github-delivery', 'test-delivery-id')
          .set('x-hub-signature-256', signature)
          .send(payload)

        expect(res.status).to.equal(200)
        expect(res.text).to.equal('pong')
      })
    })

    describe('unsupported events', () => {
      it('should return 200 with skip message for unsupported event types', async () => {
        const payload = { ref: 'refs/heads/main' }
        const signature = generate_webhook_signature(payload)
        const res = await request(server)
          .post('/api/github/webhooks')
          .set('x-github-event', 'push')
          .set('x-github-delivery', 'test-delivery-id')
          .set('x-hub-signature-256', signature)
          .send(payload)

        expect(res.status).to.equal(200)
        expect(res.body.ok).to.be.true
        expect(res.body.message).to.include('not processed')
      })
    })

    describe('issues event validation', () => {
      it('should return 400 for issues event without issue data', async () => {
        const payload = { action: 'opened', repository: { name: 'test' } }
        const signature = generate_webhook_signature(payload)
        const res = await request(server)
          .post('/api/github/webhooks')
          .set('x-github-event', 'issues')
          .set('x-github-delivery', 'test-delivery-id')
          .set('x-hub-signature-256', signature)
          .send(payload)

        expect(res.status).to.equal(400)
        expect(res.body.error).to.equal('Bad Request')
        expect(res.body.message).to.include('Invalid issues event payload')
      })

      it('should return 400 for issues event without repository data', async () => {
        const payload = { action: 'opened', issue: { number: 1 } }
        const signature = generate_webhook_signature(payload)
        const res = await request(server)
          .post('/api/github/webhooks')
          .set('x-github-event', 'issues')
          .set('x-github-delivery', 'test-delivery-id')
          .set('x-hub-signature-256', signature)
          .send(payload)

        expect(res.status).to.equal(400)
        expect(res.body.error).to.equal('Bad Request')
      })
    })

    describe('pull_request event', () => {
      it('should acknowledge PR events without action', async () => {
        const payload = {
          action: 'opened',
          number: 123,
          pull_request: {
            number: 123,
            title: 'Test PR'
          },
          repository: {
            id: 123,
            full_name: 'test-org/test-repo',
            owner: {
              id: 456,
              login: 'test-org'
            }
          },
          sender: {
            login: 'test-user'
          }
        }
        const signature = generate_webhook_signature(payload)
        const res = await request(server)
          .post('/api/github/webhooks')
          .set('x-github-event', 'pull_request')
          .set('x-github-delivery', 'test-delivery-id')
          .set('x-hub-signature-256', signature)
          .send(payload)

        expect(res.status).to.equal(200)
        expect(res.body.ok).to.be.true
      })

      it('should acknowledge PR event even with minimal payload', async () => {
        const payload = { action: 'opened' }
        const signature = generate_webhook_signature(payload)
        const res = await request(server)
          .post('/api/github/webhooks')
          .set('x-github-event', 'pull_request')
          .set('x-github-delivery', 'test-delivery-id')
          .set('x-hub-signature-256', signature)
          .send(payload)

        expect(res.status).to.equal(200)
        expect(res.body.ok).to.be.true
      })
    })
  })
})
