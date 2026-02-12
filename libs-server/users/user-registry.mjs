import debug from 'debug'

import {
  load_identity_by_public_key,
  load_identity_by_username,
  load_all_identities,
  clear_identity_cache
} from '#libs-server/users/identity-loader.mjs'
import {
  resolve_user_rules,
  convert_identity_to_user
} from '#libs-server/users/permission-resolver.mjs'
import { clear_role_cache } from '#libs-server/users/role-loader.mjs'

const log = debug('user-registry')

class UserRegistry {
  /**
   * Find user by public key using identity entities
   *
   * @param {string} user_public_key - Public key to look up
   * @returns {Promise<Object|null>} User object or null
   */
  async find_by_public_key(user_public_key) {
    if (!user_public_key) {
      return null
    }

    // Special case: 'public' user - look up by username
    if (user_public_key === 'public') {
      try {
        const public_identity = await load_identity_by_username({
          username: 'public'
        })
        if (public_identity) {
          log('Found public identity entity')
          return await convert_identity_to_user({ identity: public_identity })
        }
      } catch (error) {
        log(`Error loading public identity: ${error.message}`)
      }
      return null
    }

    try {
      const identity = await load_identity_by_public_key({
        public_key: user_public_key
      })
      if (identity) {
        log(
          `Found identity entity for public key: ${user_public_key.slice(0, 8)}...`
        )
        return await convert_identity_to_user({ identity })
      }
    } catch (error) {
      log(`Error loading identity by public key: ${error.message}`)
    }

    return null
  }

  /**
   * Find user by username using identity entities
   *
   * @param {string} username - Username to look up
   * @returns {Promise<Object|null>} User object with user_public_key or null
   */
  async find_by_username(username) {
    if (!username) {
      return null
    }

    try {
      const identity = await load_identity_by_username({ username })
      if (identity) {
        log(`Found identity entity for username: ${username}`)
        const user = await convert_identity_to_user({ identity })
        if (user) {
          return {
            user_public_key: identity.auth_public_key,
            ...user
          }
        }
      }
    } catch (error) {
      log(`Error loading identity by username: ${error.message}`)
    }

    return null
  }

  /**
   * Get resolved permission rules for a user
   *
   * @param {Object} params - Parameters
   * @param {string} params.public_key - User's public key
   * @returns {Promise<Array>} Array of permission rules
   */
  async get_user_rules({ public_key }) {
    if (!public_key) {
      return []
    }

    // Special case: 'public' user
    if (public_key === 'public') {
      try {
        const public_identity = await load_identity_by_username({
          username: 'public'
        })
        if (public_identity) {
          return await resolve_user_rules({ identity: public_identity })
        }
      } catch (error) {
        log(`Error loading public identity rules: ${error.message}`)
      }
      return []
    }

    try {
      const identity = await load_identity_by_public_key({ public_key })
      if (identity) {
        return await resolve_user_rules({ identity })
      }
    } catch (error) {
      log(`Error loading identity rules: ${error.message}`)
    }

    return []
  }

  /**
   * Check if a user has access (identity entity exists)
   *
   * @param {string} user_public_key - Public key to check
   * @returns {Promise<boolean>} True if user has access
   */
  async user_has_access(user_public_key) {
    if (!user_public_key) {
      return false
    }

    try {
      const identity = await load_identity_by_public_key({
        public_key: user_public_key
      })
      if (identity) {
        return true
      }
    } catch (error) {
      log(`Error checking identity access: ${error.message}`)
    }

    return false
  }

  /**
   * List all users from identity entities
   *
   * @returns {Promise<Array>} Array of user objects with user_public_key
   */
  async list_users() {
    try {
      const identities = await load_all_identities()
      const users = await Promise.all(
        identities.map(async (identity) => {
          const user = await convert_identity_to_user({ identity })
          if (user) {
            return {
              user_public_key: identity.auth_public_key,
              ...user
            }
          }
          return null
        })
      )
      return users.filter(Boolean)
    } catch (error) {
      log(`Error listing users: ${error.message}`)
      return []
    }
  }

  // Clear cache for testing
  _clear_cache() {
    clear_identity_cache()
    clear_role_cache()
  }
}

// Create singleton instance
const user_registry = new UserRegistry()

export default user_registry
export { UserRegistry }
