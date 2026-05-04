// Server-internal coordination between submit (HTTP route) and import (sync-user-session). Not thread state.

import { get_redis_connection } from '#server/services/redis/get-connection.mjs'

const SUBMIT_CORRELATION_KEY_PREFIX = 'submit:correlation:'
const SUBMIT_CORRELATION_TTL_SECONDS = 30 * 60
const TEST_KEY_PREFIX = 'test:'

const build_key = (thread_id) =>
  `${process.env.NODE_ENV === 'test' ? TEST_KEY_PREFIX : ''}${SUBMIT_CORRELATION_KEY_PREFIX}${thread_id}`

export const write_submit_correlation = async ({
  thread_id,
  prompt_correlation_id,
  submitted_at
}) => {
  const redis = get_redis_connection()
  await redis.set(
    build_key(thread_id),
    JSON.stringify({ prompt_correlation_id, submitted_at }),
    'EX',
    SUBMIT_CORRELATION_TTL_SECONDS
  )
}

export const read_submit_correlation = async ({ thread_id }) => {
  const redis = get_redis_connection()
  const raw = await redis.get(build_key(thread_id))
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const clear_submit_correlation = async ({ thread_id }) => {
  const redis = get_redis_connection()
  await redis.del(build_key(thread_id))
}

export {
  SUBMIT_CORRELATION_KEY_PREFIX,
  SUBMIT_CORRELATION_TTL_SECONDS,
  TEST_KEY_PREFIX
}
