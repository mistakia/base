import IORedis from 'ioredis'
import debug from 'debug'
import config from '#config'

const log = debug('redis:connection')

const DEFAULT_REDIS_URL = 'redis://localhost:6379'

// Module-level singleton instance
let redis_connection = null

/**
 * Get Redis URL from config or environment
 * @returns {string} Redis URL
 */
const get_redis_url = () => {
  return (
    config.threads?.queue?.redis_url ||
    process.env.REDIS_URL ||
    DEFAULT_REDIS_URL
  )
}

/**
 * Initialize Redis connection with event handlers
 * @returns {IORedis} Redis connection instance
 */
const initialize_redis_connection = () => {
  const redis_url = get_redis_url()
  log(`Connecting to Redis: ${redis_url}`)

  const connection = new IORedis(redis_url, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false // Improve performance
  })

  connection.on('error', (error) => {
    log('Redis connection error:', error)
  })

  connection.on('connect', () => {
    log('Redis connected')
  })

  return connection
}

/**
 * Get or create Redis connection singleton
 * @returns {IORedis} Redis connection instance
 */
export const get_redis_connection = () => {
  if (!redis_connection) {
    redis_connection = initialize_redis_connection()
  }
  return redis_connection
}

/**
 * Close the Redis connection
 */
export const close_redis_connection = async () => {
  if (redis_connection) {
    await redis_connection.quit()
    redis_connection = null
    log('Redis connection closed')
  }
}
