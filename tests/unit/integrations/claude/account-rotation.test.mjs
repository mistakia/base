import { describe, it, before, after, beforeEach } from 'mocha'
import { expect } from 'chai'

import {
  get_cached_usage,
  set_cached_usage,
  mark_account_exhausted,
  is_account_exhausted,
  clear_account_exhausted,
  compute_account_score,
  classify_usage_result
} from '#libs-server/integrations/claude/account-rotation/check-usage.mjs'
import os from 'os'
import path from 'path'
import {
  select_account,
  resolve_account_config_dir,
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

  describe('resolve_account_config_dir', () => {
    it('returns null for host default ~/.claude/', () => {
      const result = resolve_account_config_dir({
        account: { namespace: 'test-primary' },
        execution_mode: 'host',
        machine_id: 'test-host-default'
      })
      expect(result).to.be.null
    })

    it('returns null for host default ~/.claude (no trailing slash)', () => {
      const result = resolve_account_config_dir({
        account: { namespace: 'test-primary' },
        execution_mode: 'host',
        machine_id: 'test-host-default-notrail'
      })
      expect(result).to.be.null
    })

    it('resolves tilde to absolute path for non-default host config_dir', () => {
      const result = resolve_account_config_dir({
        account: { namespace: 'test-secondary' },
        execution_mode: 'host',
        machine_id: 'test-host'
      })
      expect(result).to.equal(
        path.join(os.homedir(), '.claude-test-secondary/')
      )
    })

    it('returns null for container default /home/node/.claude/', () => {
      const result = resolve_account_config_dir({
        account: {
          container_config_dir: '/home/node/.claude/'
        },
        execution_mode: 'container'
      })
      expect(result).to.be.null
    })

    it('returns absolute container path for non-default container_config_dir', () => {
      const result = resolve_account_config_dir({
        account: {
          container_config_dir: '/home/node/.claude-earn.crop.code'
        },
        execution_mode: 'container'
      })
      expect(result).to.equal('/home/node/.claude-earn.crop.code')
    })

    it('routes container_user execution_mode to container_config_dir', () => {
      const result = resolve_account_config_dir({
        account: {
          container_config_dir: '/home/node/.claude-earn.crop.code'
        },
        execution_mode: 'container_user'
      })
      expect(result).to.equal('/home/node/.claude-earn.crop.code')
    })

    it('returns null when host machine has no claude_paths entry', () => {
      const result = resolve_account_config_dir({
        account: { namespace: 'unknown' },
        execution_mode: 'host',
        machine_id: 'nonexistent-machine'
      })
      expect(result).to.be.null
    })

    it('returns null when container_config_dir is missing', () => {
      const result = resolve_account_config_dir({
        account: { container_config_dir: null },
        execution_mode: 'container'
      })
      expect(result).to.be.null
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
      // Clear exhausted markers and usage cache
      const exhausted_keys = await redis.keys('claude:exhausted:*')
      if (exhausted_keys.length > 0) await redis.del(...exhausted_keys)
      const usage_keys = await redis.keys('claude:usage:*')
      if (usage_keys.length > 0) await redis.del(...usage_keys)
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

      const account = await select_account({ execution_mode: 'host', machine_id: 'test-host' })

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
      const account = await select_account({ execution_mode: 'host', machine_id: 'test-host' })

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
        await select_account({ execution_mode: 'host', machine_id: 'test-host' })
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

      const account = await select_account({ execution_mode: 'host', machine_id: 'test-host' })

      expect(account.config_dir).to.match(/^\//)
      expect(account.config_dir).to.not.include('~')
    })

    it('should return container path for container execution_mode', async function () {
      if (!config.claude_accounts?.enabled) this.skip()

      const account = await select_account({ execution_mode: 'container' })

      expect(account.config_dir).to.match(/^\/home\/node\//)
    })
  })

  describe('compute_account_score', () => {
    it('should return lower score for accounts near reset', () => {
      const near_reset = {
        seven_day: {
          utilization: 40,
          resets_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
        }
      }
      const far_from_reset = {
        seven_day: {
          utilization: 40,
          resets_at: new Date(
            Date.now() + 5 * 24 * 60 * 60 * 1000
          ).toISOString()
        }
      }

      expect(compute_account_score(near_reset)).to.be.lessThan(
        compute_account_score(far_from_reset)
      )
    })

    it('should return null when seven_day data is missing', () => {
      expect(compute_account_score({})).to.be.null
      expect(compute_account_score({ five_hour: { utilization: 50 } })).to.be
        .null
      expect(compute_account_score(null)).to.be.null
    })

    it('should clamp expired resets_at to 0', () => {
      const expired = {
        seven_day: {
          utilization: 80,
          resets_at: new Date(Date.now() - 60000).toISOString()
        }
      }

      expect(compute_account_score(expired)).to.equal(0)
    })

    it('should score near 1.0 for a fresh 7-day window', () => {
      const fresh = {
        seven_day: {
          utilization: 5,
          resets_at: new Date(
            Date.now() + 6.9 * 24 * 60 * 60 * 1000
          ).toISOString()
        }
      }

      const score = compute_account_score(fresh)

      expect(score).to.be.greaterThan(0.9)
      expect(score).to.be.at.most(1.0)
    })
  })

  describe('classify_usage_result', () => {
    const threshold = 90

    it('returns unmeasurable for null utilization', () => {
      expect(
        classify_usage_result({ utilization: null, threshold })
      ).to.equal('unmeasurable')
    })

    it('returns unmeasurable when five_hour.utilization missing', () => {
      expect(
        classify_usage_result({
          utilization: {
            five_hour: {},
            seven_day: { utilization: 10 }
          },
          threshold
        })
      ).to.equal('unmeasurable')
    })

    it('returns unmeasurable when seven_day.utilization missing', () => {
      expect(
        classify_usage_result({
          utilization: {
            five_hour: { utilization: 10 },
            seven_day: {}
          },
          threshold
        })
      ).to.equal('unmeasurable')
    })

    it('returns under when both windows below threshold', () => {
      expect(
        classify_usage_result({
          utilization: {
            five_hour: { utilization: 10 },
            seven_day: { utilization: 20 }
          },
          threshold
        })
      ).to.equal('under')
    })

    it('returns over when seven_day at 100%', () => {
      expect(
        classify_usage_result({
          utilization: {
            five_hour: { utilization: 5 },
            seven_day: { utilization: 100 }
          },
          threshold
        })
      ).to.equal('over')
    })

    it('returns over when five_hour at or above threshold', () => {
      expect(
        classify_usage_result({
          utilization: {
            five_hour: { utilization: 95 },
            seven_day: { utilization: 10 }
          },
          threshold
        })
      ).to.equal('over')
    })

    it('classifies exactly-at-threshold as over', () => {
      expect(
        classify_usage_result({
          utilization: {
            five_hour: { utilization: 90 },
            seven_day: { utilization: 10 }
          },
          threshold
        })
      ).to.equal('over')
    })
  })

  describe('select_account fill-on-miss', function () {
    beforeEach(async function () {
      if (skip) this.skip()
      if (!config.claude_accounts?.enabled) this.skip()
      const keys = await redis.keys('claude:*')
      if (keys.length > 0) await redis.del(...keys)
    })

    const make_usage = (five_hour_pct, seven_day_pct) => ({
      five_hour: {
        utilization: five_hour_pct,
        resets_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
      },
      seven_day: {
        utilization: seven_day_pct,
        resets_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
      }
    })

    const make_checker = (responses) => {
      return async ({ namespace }) => {
        const response = responses[namespace]
        if (!response) {
          return { available: false, utilization: null, cached: false, error: 'unknown' }
        }
        return response
      }
    }

    it('selects account on cache miss when live check returns under-threshold', async function () {
      const accounts = config.claude_accounts.accounts
      const primary = accounts.find((a) => a.priority === 1)

      const responses = {}
      for (const a of accounts) {
        responses[a.namespace] = {
          available: true,
          utilization: make_usage(10, 20),
          cached: false,
          error: null
        }
      }

      const account = await select_account({
        execution_mode: 'host',
        machine_id: 'test-host',
        check_usage_fn: make_checker(responses)
      })

      expect(account).to.not.be.null
      expect(account.namespace).to.equal(primary.namespace)

      const exhausted_key = await redis.get(
        `claude:exhausted:${primary.namespace}`
      )
      expect(exhausted_key).to.be.null
    })

    it('marks account over_threshold when live check returns seven_day=100', async function () {
      const accounts = config.claude_accounts.accounts
      if (accounts.length < 2) this.skip()

      const responses = {}
      for (const a of accounts) {
        responses[a.namespace] = {
          available: false,
          utilization: make_usage(5, 100),
          cached: false,
          error: null
        }
      }

      try {
        await select_account({
          execution_mode: 'host',
          machine_id: 'test-host',
          check_usage_fn: make_checker(responses)
        })
        expect.fail('should have thrown AllAccountsExhaustedError')
      } catch (error) {
        expect(error).to.be.an.instanceOf(AllAccountsExhaustedError)
        for (const detail of error.account_details) {
          expect(detail.reason).to.equal('over_threshold')
        }
      }

      for (const a of accounts) {
        const exhausted_key = await redis.get(`claude:exhausted:${a.namespace}`)
        expect(exhausted_key).to.be.null
      }
    })

    it('marks account over_threshold when live check returns five_hour at threshold', async function () {
      const accounts = config.claude_accounts.accounts
      if (accounts.length < 2) this.skip()

      const responses = {}
      for (const a of accounts) {
        responses[a.namespace] = {
          available: false,
          utilization: make_usage(95, 10),
          cached: false,
          error: null
        }
      }

      try {
        await select_account({
          execution_mode: 'host',
          machine_id: 'test-host',
          check_usage_fn: make_checker(responses)
        })
        expect.fail('should have thrown AllAccountsExhaustedError')
      } catch (error) {
        expect(error).to.be.an.instanceOf(AllAccountsExhaustedError)
        for (const detail of error.account_details) {
          expect(detail.reason).to.equal('over_threshold')
        }
      }

      for (const a of accounts) {
        const exhausted_key = await redis.get(`claude:exhausted:${a.namespace}`)
        expect(exhausted_key).to.be.null
      }
    })

    it('falls back to unscored on session_expired and does not write exhausted marker', async function () {
      const accounts = config.claude_accounts.accounts

      const responses = {}
      for (const a of accounts) {
        responses[a.namespace] = {
          available: false,
          utilization: null,
          cached: false,
          error: 'session_expired'
        }
      }

      const account = await select_account({
        execution_mode: 'host',
        machine_id: 'test-host',
        check_usage_fn: make_checker(responses)
      })

      expect(account).to.not.be.null

      for (const a of accounts) {
        const exhausted_key = await redis.get(`claude:exhausted:${a.namespace}`)
        expect(exhausted_key).to.be.null
      }
    })

    it('prefers priority-2 when priority-1 live check errors and priority-2 is under threshold', async function () {
      const accounts = config.claude_accounts.accounts
      if (accounts.length < 2) this.skip()

      const primary = accounts.find((a) => a.priority === 1)
      const secondary = accounts.find((a) => a.priority === 2)
      if (!primary || !secondary) this.skip()

      const responses = {
        [primary.namespace]: {
          available: false,
          utilization: null,
          cached: false,
          error: 'cloudflare_challenge'
        },
        [secondary.namespace]: {
          available: true,
          utilization: make_usage(10, 20),
          cached: false,
          error: null
        }
      }

      const account = await select_account({
        execution_mode: 'host',
        machine_id: 'test-host',
        check_usage_fn: make_checker(responses)
      })

      expect(account).to.not.be.null
      expect(account.namespace).to.equal(secondary.namespace)
    })

    it('treats partial cached entry as miss and re-applies threshold via live check', async function () {
      const accounts = config.claude_accounts.accounts
      const primary = accounts.find((a) => a.priority === 1)

      await set_cached_usage(
        primary.namespace,
        { five_hour: { utilization: 10 }, seven_day: {} },
        60
      )

      const responses = {}
      for (const a of accounts) {
        responses[a.namespace] = {
          available: false,
          utilization: make_usage(5, 100),
          cached: false,
          error: null
        }
      }

      let check_called = false
      const checker = async (params) => {
        if (params.namespace === primary.namespace) check_called = true
        return responses[params.namespace]
      }

      try {
        await select_account({
          execution_mode: 'host',
          machine_id: 'test-host',
          check_usage_fn: checker
        })
      } catch (error) {
        expect(error).to.be.an.instanceOf(AllAccountsExhaustedError)
      }

      expect(check_called).to.be.true
    })
  })
})
