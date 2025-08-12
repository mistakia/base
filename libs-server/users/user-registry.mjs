import path from 'path'
import fs from 'fs/promises'
import debug from 'debug'

import config from '#config'

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

  async find_by_public_key(user_public_key) {
    if (!user_public_key) {
      return null
    }

    const users = await this.load_users()
    return users[user_public_key] || null
  }

  async find_by_username(username) {
    if (!username) {
      return null
    }

    const users = await this.load_users()
    for (const [user_public_key, user] of Object.entries(users)) {
      if (user.username === username) {
        return { user_public_key, ...user }
      }
    }
    return null
  }

  async user_has_access(user_public_key) {
    if (!user_public_key) {
      return false
    }

    const users = await this.load_users()
    return user_public_key in users
  }

  // Clear cache for testing
  _clear_cache() {
    this.cache = null
    this.cache_timestamp = null
  }
}

// Create singleton instance
const user_registry = new UserRegistry()

export default user_registry
export { UserRegistry }
