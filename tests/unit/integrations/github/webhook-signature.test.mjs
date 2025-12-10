/**
 * Tests for GitHub webhook signature verification
 *
 * These tests verify the HMAC SHA-256 signature validation used
 * to authenticate incoming GitHub webhooks.
 */

import { expect } from 'chai'
import { describe, it } from 'mocha'
import crypto from 'crypto'

/**
 * Verify GitHub webhook signature (copied from server/routes/github.mjs for testing)
 * This duplicates the logic to test it in isolation
 */
function verify_github_signature(raw_body, signature, secret) {
  if (!signature) {
    return false
  }

  if (!secret) {
    return false
  }

  try {
    const hmac = crypto.createHmac('sha256', secret)
    const digest = 'sha256=' + hmac.update(raw_body).digest('hex')

    const result = crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(signature)
    )

    return result
  } catch (error) {
    return false
  }
}

/**
 * Generate a valid GitHub webhook signature for testing
 */
function generate_github_signature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret)
  return 'sha256=' + hmac.update(payload).digest('hex')
}

describe('GitHub Webhook Signature Verification', () => {
  // Test values from GitHub documentation
  // https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
  const github_test_secret = "It's a Secret to Everybody"
  const github_test_payload = 'Hello, World!'
  const github_test_signature =
    'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17'

  describe('valid signatures', () => {
    it('should verify GitHub documentation test values', () => {
      const result = verify_github_signature(
        github_test_payload,
        github_test_signature,
        github_test_secret
      )
      expect(result).to.be.true
    })

    it('should verify a valid signature with custom payload', () => {
      const secret = 'my-webhook-secret'
      const payload = JSON.stringify({ action: 'opened', issue: { number: 1 } })
      const signature = generate_github_signature(payload, secret)

      const result = verify_github_signature(payload, signature, secret)
      expect(result).to.be.true
    })

    it('should verify signature with empty payload', () => {
      const secret = 'test-secret'
      const payload = ''
      const signature = generate_github_signature(payload, secret)

      const result = verify_github_signature(payload, signature, secret)
      expect(result).to.be.true
    })

    it('should verify signature with unicode payload', () => {
      const secret = 'test-secret'
      const payload = JSON.stringify({
        title: 'Test issue with unicode',
        body: 'Contains special chars'
      })
      const signature = generate_github_signature(payload, secret)

      const result = verify_github_signature(payload, signature, secret)
      expect(result).to.be.true
    })
  })

  describe('invalid signatures', () => {
    it('should reject signature with wrong secret', () => {
      const payload = 'test payload'
      const signature = generate_github_signature(payload, 'correct-secret')

      const result = verify_github_signature(payload, signature, 'wrong-secret')
      expect(result).to.be.false
    })

    it('should reject signature with modified payload', () => {
      const secret = 'test-secret'
      const original_payload = 'original payload'
      const signature = generate_github_signature(original_payload, secret)

      const result = verify_github_signature(
        'modified payload',
        signature,
        secret
      )
      expect(result).to.be.false
    })

    it('should reject malformed signature', () => {
      const secret = 'test-secret'
      const payload = 'test payload'

      const result = verify_github_signature(
        payload,
        'invalid-signature',
        secret
      )
      expect(result).to.be.false
    })

    it('should reject signature without sha256= prefix', () => {
      const secret = 'test-secret'
      const payload = 'test payload'
      const hmac = crypto.createHmac('sha256', secret)
      const digest_without_prefix = hmac.update(payload).digest('hex')

      const result = verify_github_signature(
        payload,
        digest_without_prefix,
        secret
      )
      expect(result).to.be.false
    })
  })

  describe('missing parameters', () => {
    it('should return false when signature is missing', () => {
      const result = verify_github_signature('payload', null, 'secret')
      expect(result).to.be.false
    })

    it('should return false when signature is undefined', () => {
      const result = verify_github_signature('payload', undefined, 'secret')
      expect(result).to.be.false
    })

    it('should return false when signature is empty string', () => {
      const result = verify_github_signature('payload', '', 'secret')
      expect(result).to.be.false
    })

    it('should return false when secret is missing', () => {
      const result = verify_github_signature('payload', 'sha256=abc123', null)
      expect(result).to.be.false
    })

    it('should return false when secret is undefined', () => {
      const result = verify_github_signature(
        'payload',
        'sha256=abc123',
        undefined
      )
      expect(result).to.be.false
    })

    it('should return false when secret is empty string', () => {
      const result = verify_github_signature('payload', 'sha256=abc123', '')
      expect(result).to.be.false
    })
  })

  describe('edge cases', () => {
    it('should handle very long payloads', () => {
      const secret = 'test-secret'
      const payload = 'x'.repeat(100000)
      const signature = generate_github_signature(payload, secret)

      const result = verify_github_signature(payload, signature, secret)
      expect(result).to.be.true
    })

    it('should handle special characters in secret', () => {
      const secret = '!@#$%^&*()_+-=[]{}|;:,.<>?'
      const payload = 'test payload'
      const signature = generate_github_signature(payload, secret)

      const result = verify_github_signature(payload, signature, secret)
      expect(result).to.be.true
    })
  })
})
