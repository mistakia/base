import path from 'path'
import fs from 'fs/promises'
import debug from 'debug'
import { v4 as uuidv4 } from 'uuid'

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
    this.file_path = path.join(user_base_dir, '.system', 'users.json')
  }

  async _ensure_system_directory() {
    const system_dir = path.dirname(this.file_path)
    await fs.mkdir(system_dir, { recursive: true })
  }

  async _load_users_from_file() {
    try {
      const file_content = await fs.readFile(this.file_path, 'utf8')
      const data = JSON.parse(file_content)
      return data.users || []
    } catch (error) {
      if (error.code === 'ENOENT') {
        log('Users file not found, returning empty array')
        return []
      }
      throw new Error(`Failed to load users file: ${error.message}`)
    }
  }

  async _save_users_to_file(users) {
    await this._ensure_system_directory()

    const data = {
      export_timestamp: new Date().toISOString(),
      export_version: '1.0.0',
      source: 'user-registry',
      users
    }

    const temp_file = `${this.file_path}.tmp`

    try {
      // Write to temporary file first for atomic operation
      await fs.writeFile(temp_file, JSON.stringify(data, null, 2))

      // Atomic rename
      await fs.rename(temp_file, this.file_path)

      log(`Saved ${users.length} users to ${this.file_path}`)
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
    return [...this.cache] // Return copy to prevent external modification
  }

  async save_users(users) {
    // Validate users array
    if (!Array.isArray(users)) {
      throw new Error('Users must be an array')
    }

    // Validate each user
    const required_fields = ['user_id', 'public_key']
    for (let i = 0; i < users.length; i++) {
      const user = users[i]
      for (const field of required_fields) {
        if (!(field in user)) {
          throw new Error(`User ${i}: Missing required field: ${field}`)
        }
      }
    }

    await this._save_users_to_file(users)

    // Update cache
    this.cache = [...users]
    this.cache_timestamp = Date.now()
  }

  async find_by_public_key(public_key) {
    if (!public_key) {
      return null
    }

    const users = await this.load_users()
    return users.find((user) => user.public_key === public_key) || null
  }

  async find_by_username(username) {
    if (!username) {
      return null
    }

    const users = await this.load_users()
    return users.find((user) => user.username === username) || null
  }

  async find_by_user_id(user_id) {
    if (!user_id) {
      return null
    }

    const users = await this.load_users()
    return users.find((user) => user.user_id === user_id) || null
  }

  async create_user(user_data) {
    const users = await this.load_users()

    // Validate required fields
    if (!user_data.public_key) {
      throw new Error('public_key is required')
    }

    // Check for duplicate public key
    if (users.find((user) => user.public_key === user_data.public_key)) {
      throw new Error('User with this public key already exists')
    }

    // Check for duplicate username if provided
    if (
      user_data.username &&
      users.find((user) => user.username === user_data.username)
    ) {
      throw new Error('User with this username already exists')
    }

    // Create new user
    const new_user = {
      user_id: user_data.user_id || uuidv4(),
      username: user_data.username || null,
      public_key: user_data.public_key,
      email: user_data.email || null,
      created_at: user_data.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    users.push(new_user)
    await this.save_users(users)

    log(`Created user: ${new_user.user_id}`)
    return new_user
  }

  async update_user(user_id, updates) {
    const users = await this.load_users()
    const user_index = users.findIndex((user) => user.user_id === user_id)

    if (user_index === -1) {
      throw new Error('User not found')
    }

    // Validate updates
    if (
      updates.public_key &&
      updates.public_key !== users[user_index].public_key
    ) {
      // Check for duplicate public key
      if (users.find((user) => user.public_key === updates.public_key)) {
        throw new Error('User with this public key already exists')
      }
    }

    if (updates.username && updates.username !== users[user_index].username) {
      // Check for duplicate username
      if (users.find((user) => user.username === updates.username)) {
        throw new Error('User with this username already exists')
      }
    }

    // Apply updates
    const updated_user = {
      ...users[user_index],
      ...updates,
      updated_at: new Date().toISOString()
    }

    users[user_index] = updated_user
    await this.save_users(users)

    log(`Updated user: ${user_id}`)
    return updated_user
  }

  async delete_user(user_id) {
    const users = await this.load_users()
    const user_index = users.findIndex((user) => user.user_id === user_id)

    if (user_index === -1) {
      throw new Error('User not found')
    }

    const deleted_user = users.splice(user_index, 1)[0]
    await this.save_users(users)

    log(`Deleted user: ${user_id}`)
    return deleted_user
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
