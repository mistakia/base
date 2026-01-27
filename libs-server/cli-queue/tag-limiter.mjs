import debug from 'debug'

const log = debug('cli-queue:tag-limiter')

const TAG_SET_PREFIX = 'cli-queue:tag:'

/**
 * Get the Redis key for a tag's running jobs set
 */
const get_tag_key = (tag) => `${TAG_SET_PREFIX}${tag}`

/**
 * Lua script for atomic tag acquisition
 * Checks all tag limits and registers job atomically if all under limits
 * Returns: 1 if acquired, 0 if blocked (with blocking tag names as additional return values)
 */
const ACQUIRE_TAGS_SCRIPT = `
local job_id = ARGV[1]
local num_tags = tonumber(ARGV[2])

-- First pass: check all limits
local blocking_tags = {}
for i = 1, num_tags do
  local tag_key = KEYS[i]
  local max_concurrent = tonumber(ARGV[2 + i])
  local current = redis.call('SCARD', tag_key)
  if current >= max_concurrent then
    table.insert(blocking_tags, ARGV[2 + num_tags + i])
  end
end

-- If any tag is at limit, return failure with blocking tags
if #blocking_tags > 0 then
  return {0, unpack(blocking_tags)}
end

-- All limits OK - register job for all tags atomically
for i = 1, num_tags do
  redis.call('SADD', KEYS[i], job_id)
end

return {1}
`

/**
 * Atomically acquire tags for a job (check limits + register in one operation)
 * This prevents race conditions between checking and registering
 * @param {Object} params
 * @param {string} params.job_id - Job identifier
 * @param {string[]} params.tags - Tags to acquire
 * @param {Object} params.tag_limits - Map of tag name to { max_concurrent: N }
 * @param {Object} params.redis - Redis connection
 * @returns {Promise<{ acquired: boolean, blocking_tags: string[] }>}
 */
export const try_acquire_tags = async ({ job_id, tags, tag_limits, redis }) => {
  if (!tags || tags.length === 0) {
    return { acquired: true, blocking_tags: [] }
  }

  // Build arguments for Lua script: job_id, num_tags, limits..., tag_names...
  const keys = tags.map(get_tag_key)
  const limits = tags.map((tag) => {
    const limit_config = tag_limits[tag] || tag_limits.default
    return limit_config?.max_concurrent ?? 10
  })
  const argv = [job_id, tags.length, ...limits, ...tags]

  try {
    const result = await redis.eval(
      ACQUIRE_TAGS_SCRIPT,
      keys.length,
      ...keys,
      ...argv
    )
    const acquired = result[0] === 1
    const blocking_tags = acquired ? [] : result.slice(1)

    if (acquired) {
      log(`Job ${job_id}: acquired tags [${tags.join(', ')}]`)
    } else {
      log(`Job ${job_id}: blocked by tags [${blocking_tags.join(', ')}]`)
    }

    return { acquired, blocking_tags }
  } catch (error) {
    log(`Job ${job_id}: failed to acquire tags - ${error.message}`)
    throw error
  }
}

/**
 * Unregister a job from all its tags
 * @param {Object} params
 * @param {string} params.job_id - Job identifier
 * @param {string[]} params.tags - Tags to unregister
 * @param {Object} params.redis - Redis connection
 */
export const unregister_job_tags = async ({ job_id, tags, redis }) => {
  if (!tags || tags.length === 0) {
    return
  }

  const pipeline = redis.pipeline()

  for (const tag of tags) {
    pipeline.srem(get_tag_key(tag), job_id)
  }

  const results = await pipeline.exec()

  // Check for errors in pipeline results
  const errors = results.filter(([err]) => err !== null)
  if (errors.length > 0) {
    log(`Job ${job_id}: ${errors.length} error(s) unregistering tags`)
  }

  log(`Unregistered job ${job_id} from tags: ${tags.join(', ')}`)
}
