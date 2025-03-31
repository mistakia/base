/**
 * User utilities
 */

/**
 * Converts a user_id from hex string to Buffer if needed
 * @param {string|Buffer} user_id - User ID to normalize
 * @returns {Buffer|string} Normalized user ID
 */
export default function normalize_user_id(user_id) {
  // Convert user_id from hex if needed
  if (typeof user_id === 'string' && /^[0-9a-f]+$/.test(user_id)) {
    return Buffer.from(user_id, 'hex')
  }
  return user_id
}
