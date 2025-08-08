import { v5 as uuidv5 } from 'uuid'

// Namespace UUID for generating deterministic thread IDs from session IDs
const SESSION_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

/**
 * Generate deterministic thread ID from session information
 * @param {Object} params - Session parameters
 * @param {string} params.session_id - Session ID from provider
 * @param {string} params.session_provider - Session provider name
 * @returns {string} Deterministic thread ID
 */
export function generate_thread_id_from_session({
  session_id,
  session_provider
}) {
  if (!session_provider) {
    throw new Error('session_provider must be defined')
  }
  const session_key = `${session_provider}:${session_id}`
  return uuidv5(session_key, SESSION_NAMESPACE)
}
