import path from 'path'
import fs from 'fs/promises'
import debug from 'debug'

import config from '#config'
import {
  load_identity_by_public_key,
  load_identity_by_username,
  clear_identity_cache
} from '#libs-server/users/identity-loader.mjs'
import {
  resolve_user_rules,
  convert_identity_to_user
} from '#libs-server/users/permission-resolver.mjs'
import { clear_role_cache } from '#libs-server/users/role-loader.mjs'

const log = debug('user-registry')

class UserRegistry {
  constructor() {
    this.cache = null
    this.cache_timestamp = null
    this.file_path = null
    this._init_file_path()
  }

  _init_file_path() {
    const user_base_dir =
      config.user_base_directory || process.env.USER_BASE_DIRECTORY
    if (!user_base_dir) {
      throw new Error('USER_BASE_DIRECTORY not configured')
    }
    this.file_path = path.join(user_base_dir, 'users.json')
  }

  async _ensure_directory() {
    const dir = path.dirname(this.file_path)
    await fs.mkdir(dir, { recursive: true })
  }

  async _load_users_from_file() {
    try {
      const file_content = await fs.readFile(this.file_path, 'utf8')
      const data = JSON.parse(file_content)
      return data.users || {}
    } catch (error) {
      if (error.code === 'ENOENT') {
        log('Users file not found, returning empty object')
        return {}
      }
      throw new Error(`Failed to load users file: ${error.message}`)
    }
  }

  async _save_users_to_file(users) {
    await this._ensure_directory()

    const data = {
      users
    }

    const temp_file = `${this.file_path}.tmp`

    try {
      // Write to temporary file first for atomic operation
      await fs.writeFile(temp_file, JSON.stringify(data, null, 2))

      // Atomic rename
      await fs.rename(temp_file, this.file_path)

      log(`Saved ${Object.keys(users).length} users to ${this.file_path}`)
    } catch (error) {
      // Clean up temporary file if it exists
      try {
        await fs.unlink(temp_file)
      } catch (cleanup_error) {
        // Ignore cleanup errors
      }
      throw new Error(`Failed to save users file: ${error.message}`)
    }
  }

  async _get_file_mtime() {
    try {
      const stats = await fs.stat(this.file_path)
      return stats.mtime.getTime()
    } catch (error) {
      return null
    }
  }

  async _refresh_cache_if_needed() {
    const file_mtime = await this._get_file_mtime()

    if (
      !this.cache ||
      !this.cache_timestamp ||
      file_mtime > this.cache_timestamp
    ) {
      log('Refreshing user cache')
      this.cache = await this._load_users_from_file()
      this.cache_timestamp = file_mtime || Date.now()
    }
  }

  async load_users() {
    await this._refresh_cache_if_needed()
    return { ...this.cache } // Return copy to prevent external modification
  }

  async save_users(users) {
    // Validate users object
    if (typeof users !== 'object' || users === null) {
      throw new Error('Users must be an object')
    }

    // Validate each user
    const required_fields = ['username', 'created_at']
    for (const [user_public_key, user] of Object.entries(users)) {
      for (const field of required_fields) {
        if (!(field in user)) {
          throw new Error(
            `User ${user_public_key}: Missing required field: ${field}`
          )
        }
      }
    }

    await this._save_users_to_file(users)

    // Update cache
    this.cache = { ...users }
    this.cache_timestamp = Date.now()
  }

  /**
   * Find user by public key
   * First tries to load from identity entities, falls back to users.json
   *
   * @param {string} user_public_key - Public key to look up
   * @returns {Promise<Object|null>} User object or null
   */
  async find_by_public_key(user_public_key) {
    if (!user_public_key) {
      return null
    }

    // Special case: 'public' user - use fallback
    if (user_public_key === 'public') {
      // Try to load public.md identity first
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

      // Fall back to users.json
      const users = await this.load_users()
      return users.public || null
    }

    // Try entity-based loading first
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

    // Fall back to users.json
    log(
      `Falling back to users.json for public key: ${user_public_key.slice(0, 8)}...`
    )
    const users = await this.load_users()
    return users[user_public_key] || null
  }

  /**
   * Find user by username
   * First tries to load from identity entities, falls back to users.json
   *
   * @param {string} username - Username to look up
   * @returns {Promise<Object|null>} User object with user_public_key or null
   */
  async find_by_username(username) {
    if (!username) {
      return null
    }

    // Try entity-based loading first
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

    // Fall back to users.json
    log(`Falling back to users.json for username: ${username}`)
    const users = await this.load_users()
    for (const [user_public_key, user] of Object.entries(users)) {
      if (user.username === username) {
        return { user_public_key, ...user }
      }
    }
    return null
  }

  /**
   * Get resolved permission rules for a user
   * Loads identity entity and resolves rules from identity and roles
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

      // Fall back to users.json
      const users = await this.load_users()
      const public_user = users.public
      if (public_user?.permissions?.rules) {
        return public_user.permissions.rules
      }
      return []
    }

    // Try entity-based loading first
    try {
      const identity = await load_identity_by_public_key({ public_key })
      if (identity) {
        return await resolve_user_rules({ identity })
      }
    } catch (error) {
      log(`Error loading identity rules: ${error.message}`)
    }

    // Fall back to users.json
    const users = await this.load_users()
    const user = users[public_key]
    if (user?.permissions?.rules) {
      return user.permissions.rules
    }
    return []
  }

  async user_has_access(user_public_key) {
    if (!user_public_key) {
      return false
    }

    // Try entity-based loading first
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

    // Fall back to users.json
    const users = await this.load_users()
    return user_public_key in users
  }

  // Clear cache for testing
  _clear_cache() {
    this.cache = null
    this.cache_timestamp = null
    clear_identity_cache()
    clear_role_cache()
  }
}

// Create singleton instance
const user_registry = new UserRegistry()

export default user_registry
export { UserRegistry }
