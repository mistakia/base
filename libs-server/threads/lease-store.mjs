import IORedis from 'ioredis'
import debug from 'debug'
import config from '#config'
import { assert_on_machine, WrongMachineError } from '#libs-server/machine/assert-machine.mjs'

const log = debug('threads:lease-store')

const LEASE_KEY_PREFIX = 'lease:thread:'
const TOKEN_KEY_PREFIX = 'lease_token:thread:'
const SCAN_COUNT = 100

export class LeaseStoreNotOnStorage extends WrongMachineError {
  constructor(actual_hostname, expected_hostname) {
    super(actual_hostname, expected_hostname, 'storage')
    this.name = 'LeaseStoreNotOnStorage'
  }
}

const _assert_on_storage = () => {
  try {
    assert_on_machine('storage')
  } catch (err) {
    if (err instanceof WrongMachineError) {
      throw new LeaseStoreNotOnStorage(err.actual, err.expected)
    }
    throw err
  }
}

let _redis = null

const _get_redis = () => {
  if (_redis) return _redis
  const redis_url =
    config.threads?.queue?.redis_url ||
    process.env.REDIS_URL ||
    'redis://localhost:6379'
  _redis = new IORedis(redis_url, {
    lazyConnect: false,
    maxRetriesPerRequest: 3
  })
  _redis.on('error', (err) => log('redis error: %s', err?.message))
  return _redis
}

const _lease_key = (thread_id) => `${LEASE_KEY_PREFIX}${thread_id}`
const _token_key = (thread_id) => `${TOKEN_KEY_PREFIX}${thread_id}`

// KEYS[1]=lease_key, KEYS[2]=token_key
// ARGV[1]=ttl_ms, ARGV[2]=machine_id, ARGV[3]=session_id ('' = null),
// ARGV[4]=mode, ARGV[5]=acquired_at, ARGV[6]=expires_at
const ACQUIRE_LUA = `
local existing = redis.call('GET', KEYS[1])
if existing then
  return {0, existing}
end
local token = redis.call('INCR', KEYS[2])
local session_id = ARGV[3]
if session_id == '' then session_id = cjson.null end
local value = cjson.encode({
  machine_id = ARGV[2],
  session_id = session_id,
  mode = ARGV[4],
  lease_token = token,
  acquired_at = tonumber(ARGV[5]),
  expires_at = tonumber(ARGV[6])
})
redis.call('SET', KEYS[1], value, 'PX', tonumber(ARGV[1]))
return {1, value}
`

// KEYS[1]=lease_key, ARGV[1]=expected_token, ARGV[2]=ttl_ms, ARGV[3]=expires_at
const RENEW_LUA = `
local existing = redis.call('GET', KEYS[1])
if not existing then return 0 end
local decoded = cjson.decode(existing)
if tonumber(decoded.lease_token) ~= tonumber(ARGV[1]) then return 0 end
decoded.expires_at = tonumber(ARGV[3])
redis.call('SET', KEYS[1], cjson.encode(decoded), 'PX', tonumber(ARGV[2]))
return 1
`

// KEYS[1]=lease_key, ARGV[1]=expected_token, ARGV[2]=session_id
// Sets session_id only when the current value is null. Preserves TTL.
const BIND_SESSION_ID_LUA = `
local existing = redis.call('GET', KEYS[1])
if not existing then return 0 end
local decoded = cjson.decode(existing)
if tonumber(decoded.lease_token) ~= tonumber(ARGV[1]) then return 0 end
if decoded.session_id and decoded.session_id ~= cjson.null then return 0 end
decoded.session_id = ARGV[2]
local pttl = redis.call('PTTL', KEYS[1])
if pttl <= 0 then return 0 end
redis.call('SET', KEYS[1], cjson.encode(decoded), 'PX', pttl)
return 1
`

// KEYS[1]=lease_key, ARGV[1]=expected_token
const RELEASE_LUA = `
local existing = redis.call('GET', KEYS[1])
if not existing then return 0 end
local decoded = cjson.decode(existing)
if tonumber(decoded.lease_token) ~= tonumber(ARGV[1]) then return 0 end
redis.call('DEL', KEYS[1])
return 1
`

const _now = () => Date.now()

export const acquire_lease = async ({
  thread_id,
  machine_id,
  session_id = null,
  ttl_ms,
  mode = 'session'
}) => {
  _assert_on_storage()
  if (!thread_id) throw new Error('acquire_lease: thread_id required')
  if (!machine_id) throw new Error('acquire_lease: machine_id required')
  if (!ttl_ms || ttl_ms <= 0) throw new Error('acquire_lease: ttl_ms required')

  const redis = _get_redis()
  const acquired_at = _now()
  const expires_at = acquired_at + ttl_ms
  const result = await redis.eval(
    ACQUIRE_LUA,
    2,
    _lease_key(thread_id),
    _token_key(thread_id),
    String(ttl_ms),
    machine_id,
    session_id == null ? '' : String(session_id),
    mode,
    String(acquired_at),
    String(expires_at)
  )
  const [acquired_flag, value_str] = result
  const decoded = JSON.parse(value_str)
  if (acquired_flag === 1) {
    log(
      'acquired lease %s by %s token=%d',
      thread_id,
      machine_id,
      decoded.lease_token
    )
    return { acquired: true, ...decoded }
  }
  log('lease %s already held by %s', thread_id, decoded.machine_id)
  return { acquired: false, ...decoded }
}

export const renew_lease = async ({ thread_id, lease_token, ttl_ms }) => {
  _assert_on_storage()
  if (!thread_id) throw new Error('renew_lease: thread_id required')
  if (lease_token == null) throw new Error('renew_lease: lease_token required')
  if (!ttl_ms || ttl_ms <= 0) throw new Error('renew_lease: ttl_ms required')

  const redis = _get_redis()
  const expires_at = _now() + ttl_ms
  const result = await redis.eval(
    RENEW_LUA,
    1,
    _lease_key(thread_id),
    String(lease_token),
    String(ttl_ms),
    String(expires_at)
  )
  if (result === 1) {
    log('renewed lease %s token=%s', thread_id, lease_token)
    return { renewed: true, expires_at }
  }
  log(
    'renew failed for %s (token=%s, redis=%s)',
    thread_id,
    lease_token,
    result
  )
  return { renewed: false }
}

export const bind_session_id = async ({
  thread_id,
  lease_token,
  session_id
}) => {
  _assert_on_storage()
  if (!thread_id) throw new Error('bind_session_id: thread_id required')
  if (lease_token == null)
    throw new Error('bind_session_id: lease_token required')
  if (!session_id) throw new Error('bind_session_id: session_id required')

  const redis = _get_redis()
  const result = await redis.eval(
    BIND_SESSION_ID_LUA,
    1,
    _lease_key(thread_id),
    String(lease_token),
    String(session_id)
  )
  if (result === 1) {
    log('bound session_id %s to lease %s token=%s', session_id, thread_id, lease_token)
    return { bound: true }
  }
  log(
    'bind no-op for %s (token=%s, redis=%s)',
    thread_id,
    lease_token,
    result
  )
  return { bound: false }
}

export const release_lease = async ({ thread_id, lease_token }) => {
  _assert_on_storage()
  if (!thread_id) throw new Error('release_lease: thread_id required')
  if (lease_token == null)
    throw new Error('release_lease: lease_token required')

  const redis = _get_redis()
  const result = await redis.eval(
    RELEASE_LUA,
    1,
    _lease_key(thread_id),
    String(lease_token)
  )
  if (result === 1) {
    log('released lease %s token=%s', thread_id, lease_token)
    return { released: true }
  }
  log(
    'release no-op for %s (token=%s, redis=%s)',
    thread_id,
    lease_token,
    result
  )
  return { released: false }
}

export const inspect_lease = async ({ thread_id }) => {
  _assert_on_storage()
  if (!thread_id) throw new Error('inspect_lease: thread_id required')
  const redis = _get_redis()
  const value_str = await redis.get(_lease_key(thread_id))
  if (!value_str) return null
  return JSON.parse(value_str)
}

export const list_active_leases = async ({ machine_id = null } = {}) => {
  _assert_on_storage()
  const redis = _get_redis()
  const leases = []
  let cursor = '0'
  do {
    const [next_cursor, keys] = await redis.scan(
      cursor,
      'MATCH',
      `${LEASE_KEY_PREFIX}*`,
      'COUNT',
      String(SCAN_COUNT)
    )
    cursor = next_cursor
    if (keys.length === 0) continue
    const values = await redis.mget(...keys)
    for (let i = 0; i < keys.length; i += 1) {
      const value_str = values[i]
      if (!value_str) continue
      let parsed
      try {
        parsed = JSON.parse(value_str)
      } catch {
        log('skipping unparsable lease value at %s', keys[i])
        continue
      }
      if (machine_id && parsed.machine_id !== machine_id) continue
      const thread_id = keys[i].slice(LEASE_KEY_PREFIX.length)
      leases.push({ thread_id, ...parsed })
    }
  } while (cursor !== '0')
  return leases
}

export const _close_for_tests = async () => {
  if (_redis) {
    await _redis.quit()
    _redis = null
  }
}
