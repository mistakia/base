import { describe, it, before, after, beforeEach } from 'mocha'
import { expect } from 'chai'

import {
  get_cached_usage,
  set_cached_usage,
  mark_account_exhausted,
  is_account_exhausted,
  clear_account_exhausted,
  configure_redis
} from '#libs-server/integrations/claude/account-rotation/check-usage.mjs'
import {
  select_account,
  AllAccountsExhaustedError
} from '#libs-server/integrations/claude/account-rotation/select-account.mjs'
import config from '#config'
import { get_redis_connection } from '#server/services/redis/get-connection.mjs'

const TEST_NAMESPACE = 'test-account'

describe('Claude Account Rotation', function () {
  this.timeout(10000)

  let redis
  let skip = false

  before(function () {
    try {
      configure_redis(get_redis_connection)
      redis = get_redis_connection()
    } catch {
      skip = true
    }
  })

  after(async function () {
    if (redis) {
      // Clean up test keys
      const keys = await redis.keys('claude:*test*')
      if (keys.length > 0) await redis.del(...keys)
    }
  })

  describe('AllAccountsExhaustedError', () => {
    it('should have correct name and message', () => {
      const error = new AllAccountsExhaustedError([
        { namespace: 'acct-a', reason: 'exhausted' },
        { namespace: 'acct-b', reason: 'marked_exhausted' }
      ])

      expect(error).to.be.an.instanceOf(Error)
      expect(error.name).to.equal('AllAccountsExhaustedError')
      expect(error.message).to.include('acct-a')
      expect(error.message).to.include('acct-b')
      expect(error.account_details).to.have.lengthOf(2)
    })

    it('should handle empty account details', () => {
      const error = new AllAccountsExhaustedError([])
      expect(error.name).to.equal('AllAccountsExhaustedError')
      expect(error.account_details).to.have.lengthOf(0)
    })
  })

  describe('Redis cache operations', function () {
    beforeEach(async function () {
      if (skip) this.skip()
      // Clean test keys
      const keys = await redis.keys('claude:*test*')
      if (keys.length > 0) await redis.del(...keys)
    })

    describe('set_cached_usage / get_cached_usage', () => {
      it('should round-trip usage data through Redis', async () => {
        const data = {
          five_hour: { utilization: 42, resets_at: '2026-01-01T00:00:00Z' },
          seven_day: { utilization: 15, resets_at: '2026-01-07T00:00:00Z' }
        }

        await set_cached_usage(TEST_NAMESPACE, data, 60)
        const cached = await get_cached_usage(TEST_NAMESPACE)

        expect(cached).to.deep.equal(data)
      })

      it('should return null for missing cache key', async () => {
        const cached = await get_cached_usage('nonexistent-test-namespace')
        expect(cached).to.be.null
      })

      it('should set TTL on cached data', async () => {
        await set_cached_usage(TEST_NAMESPACE, { test: true }, 60)
        const ttl = await redis.ttl(`claude:usage:${TEST_NAMESPACE}`)

        expect(ttl).to.be.greaterThan(0)
        expect(ttl).to.be.at.most(60)
      })
    })

    describe('mark_account_exhausted / is_account_exhausted / clear_account_exhausted', () => {
      it('should mark and detect exhausted accounts', async () => {
        await mark_account_exhausted(TEST_NAMESPACE)
        const exhausted = await is_account_exhausted(TEST_NAMESPACE)

        expect(exhausted).to.be.true
      })

      it('should clear exhausted marker', async () => {
        await mark_account_exhausted(TEST_NAMESPACE)
        await clear_account_exhausted(TEST_NAMESPACE)
        const exhausted = await is_account_exhausted(TEST_NAMESPACE)

        expect(exhausted).to.be.false
      })

      it('should return false for non-exhausted accounts', async () => {
        const exhausted = await is_account_exhausted('never-exhausted-test')
        expect(exhausted).to.be.false
      })

      it('should use default TTL when no resets_at provided', async () => {
        await mark_account_exhausted(TEST_NAMESPACE)
        const ttl = await redis.ttl(`claude:exhausted:${TEST_NAMESPACE}`)

        // Default is 3600s (1 hour)
        expect(ttl).to.be.greaterThan(3500)
        expect(ttl).to.be.at.most(3600)
      })

      it('should derive TTL from resets_at timestamp', async () => {
        const resets_at = new Date(Date.now() + 120000).toISOString()
        await mark_account_exhausted(TEST_NAMESPACE, resets_at)
        const ttl = await redis.ttl(`claude:exhausted:${TEST_NAMESPACE}`)

        // Expected ~180s (120s + 60s buffer)
        expect(ttl).to.be.greaterThan(150)
        expect(ttl).to.be.at.most(185)
      })
    })
  })

  describe('select_account', function () {
    beforeEach(async function () {
      if (skip) this.skip()
      // Clear all exhausted markers
      const keys = await redis.keys('claude:exhausted:*')
      if (keys.length > 0) await redis.del(...keys)
    })

    it('should return null when feature is disabled', async function () {
      if (!config.claude_accounts?.enabled) {
        const result = await select_account()
        expect(result).to.be.null
      } else {
        this.skip()
      }
    })

    it('should return highest priority account when none exhausted', async function () {
      if (!config.claude_accounts?.enabled) this.skip()

      const account = await select_account({ execution_mode: 'host' })

      expect(account).to.not.be.null
      expect(account).to.have.property('namespace')
      expect(account).to.have.property('config_dir')
      expect(account).to.have.property('priority')
      expect(account.priority).to.equal(1)
    })

    it('should skip exhausted accounts', async function () {
      if (!config.claude_accounts?.enabled) this.skip()

      const accounts = config.claude_accounts.accounts
      const primary = accounts.find((a) => a.priority === 1)

      await mark_account_exhausted(primary.namespace)
      const account = await select_account({ execution_mode: 'host' })

      expect(account).to.not.be.null
      expect(account.namespace).to.not.equal(primary.namespace)

      await clear_account_exhausted(primary.namespace)
    })

    it('should throw AllAccountsExhaustedError when all exhausted', async function () {
      if (!config.claude_accounts?.enabled) this.skip()

      const accounts = config.claude_accounts.accounts
      for (const a of accounts) {
        await mark_account_exhausted(a.namespace)
      }

      try {
        await select_account({ execution_mode: 'host' })
        expect.fail('should have thrown')
      } catch (error) {
        expect(error).to.be.an.instanceOf(AllAccountsExhaustedError)
        expect(error.account_details).to.have.lengthOf(accounts.length)
      }

      for (const a of accounts) {
        await clear_account_exhausted(a.namespace)
      }
    })

    it('should resolve tilde in host config_dir to absolute path', async function () {
      if (!config.claude_accounts?.enabled) this.skip()

      const account = await select_account({ execution_mode: 'host' })

      expect(account.config_dir).to.match(/^\//)
      expect(account.config_dir).to.not.include('~')
    })

    it('should return container path for container execution_mode', async function () {
      if (!config.claude_accounts?.enabled) this.skip()

      const account = await select_account({ execution_mode: 'container' })

      expect(account.config_dir).to.match(/^\/home\/node\//)
    })
  })
})
