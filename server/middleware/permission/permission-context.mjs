import debug from 'debug'

import user_registry from '#libs-server/users/user-registry.mjs'
import { evaluate_permission_rules } from '#libs-server/permission/rule-engine.mjs'
import { verify_share_token } from '#server/middleware/verify-share-token.mjs'
import { load_resource_metadata } from './resource-metadata.mjs'
import { evict_lru_entry } from '#libs-server/utils/lru-cache.mjs'
import { validate_thread_ownership } from './permission-service.mjs'

const log = debug('permission:context')

// Maximum size for resource metadata cache to prevent unbounded memory growth
const RESOURCE_CACHE_MAX_SIZE = 500

/**
 * Check resource ownership by parsing the resource path and delegating to
 * type-specific ownership validators.
 */
const check_ownership = async ({ resource_path, user_public_key }) => {
  if (!resource_path || !user_public_key) return false

  const path_parts = resource_path.split(':')
  if (path_parts.length !== 2) return false

  const [prefix, resource] = path_parts

  if (prefix === 'user' && resource.startsWith('thread/')) {
    const thread_id = resource.replace('thread/', '')
    return validate_thread_ownership({ thread_id, user_public_key })
  }

  return false
}

/**
 * Request-scoped permission context for caching and unified permission checking
 *
 * This class caches permission-relevant data for the duration of a request,
 * eliminating duplicate filesystem reads and rule evaluations.
 */
export class PermissionContext {
  /**
   * Create a new PermissionContext
   *
   * @param {Object} params - Constructor parameters
   * @param {string|null} params.user_public_key - User's public key or null for public access
   */
  constructor({ user_public_key = null } = {}) {
    this.user_public_key = user_public_key
    this._resource_cache = new Map()
    this._user_rules = null
    this._public_rules = null
    this._global_write = null
    this._global_write_checked = false
  }

  /**
   * Get resource metadata with caching and LRU eviction
   *
   * @param {string} resource_path - Base-URI path of the resource
   * @returns {Promise<Object|null>} Resource metadata or null
   */
  async get_resource_metadata(resource_path) {
    const cached_entry = this._resource_cache.get(resource_path)
    if (cached_entry) {
      log(`Cache hit for resource metadata: ${resource_path}`)
      // Update accessed_at for LRU tracking
      cached_entry.accessed_at = Date.now()
      return cached_entry.metadata
    }

    log(`Cache miss for resource metadata: ${resource_path}`)
    const metadata = await load_resource_metadata({ resource_path })

    // LRU eviction: remove least recently accessed entry BEFORE adding new one
    // This ensures cache never exceeds max size
    if (this._resource_cache.size >= RESOURCE_CACHE_MAX_SIZE) {
      evict_lru_entry(this._resource_cache, log)
    }

    this._resource_cache.set(resource_path, {
      metadata,
      accessed_at: Date.now()
    })
    return metadata
  }

  /**
   * Get user permission rules with lazy loading
   *
   * @returns {Promise<Array>} Array of permission rules
   */
  async get_user_rules() {
    if (this._user_rules !== null) {
      return this._user_rules
    }
    this._user_rules = await this._load_user_rules()
    return this._user_rules
  }

  async _load_user_rules() {
    if (!this.user_public_key || this.user_public_key === 'public') {
      return []
    }

    try {
      // Use registry's get_user_rules which resolves rules from identity and roles
      const rules = await user_registry.get_user_rules({
        public_key: this.user_public_key
      })
      log(`Loaded ${rules.length} rules for user ${this.user_public_key}`)
      return rules
    } catch (error) {
      log(`Error loading user rules: ${error.message}`)
      return []
    }
  }

  /**
   * Get public user permission rules with lazy loading
   *
   * @returns {Promise<Array>} Array of public permission rules
   */
  async get_public_rules() {
    if (this._public_rules !== null) {
      return this._public_rules
    }
    this._public_rules = await this._load_public_rules()
    return this._public_rules
  }

  async _load_public_rules() {
    try {
      // Use registry's get_user_rules which resolves rules from identity and roles
      const rules = await user_registry.get_user_rules({ public_key: 'public' })
      log(`Loaded ${rules.length} public rules`)
      return rules
    } catch (error) {
      log(`Error loading public rules: ${error.message}`)
      return []
    }
  }

  /**
   * Check read permission for a resource
   *
   * Priority order:
   * 1. Ownership (user owns the resource)
   * 2. User-specific rules (authenticated users, excluding public)
   * 3. public_read setting (if explicitly set)
   * 4. Public user rules (fallback)
   *
   * @param {Object} params - Parameters
   * @param {string} params.resource_path - Base-URI path of the resource
   * @param {Object|null} params.metadata - Optional pre-loaded metadata
   * @param {string|null} params.share_token - Optional share token from query parameter
   * @returns {Promise<{allowed: boolean, reason: string}>} Permission result
   */
  async _check_read_permission({
    resource_path,
    metadata = null,
    share_token = null
  }) {
    // Load metadata if not provided
    const resource_metadata =
      metadata || (await this.get_resource_metadata(resource_path))

    // Step 1: Check ownership
    if (
      this.user_public_key &&
      this.user_public_key !== 'public' &&
      resource_metadata?.owner_public_key === this.user_public_key
    ) {
      log(`User ${this.user_public_key} is owner of ${resource_path}`)
      return {
        allowed: true,
        reason: 'User is owner of the resource'
      }
    }

    // Step 2: Check share token
    if (share_token && resource_metadata?.raw?.entity_id) {
      try {
        const result = await verify_share_token({
          token: share_token,
          resource_entity_id: resource_metadata.raw.entity_id,
          resource_path,
          resource_metadata
        })
        if (result.valid) {
          log(`Share token granted read access to ${resource_path}`)
          return { allowed: true, reason: 'share_token' }
        }
        log(`Share token invalid for ${resource_path}: ${result.reason}`)
      } catch (error) {
        log(`Share token verification error: ${error.message}`)
      }
    }

    // Step 3: Check user-specific rules (authenticated users only)
    if (this.user_public_key && this.user_public_key !== 'public') {
      const user_rules = await this.get_user_rules()

      if (user_rules.length > 0) {
        const user_result = await evaluate_permission_rules({
          rules: user_rules,
          resource_path,
          user_public_key: this.user_public_key,
          check_ownership
        })

        if (user_result.matching_rule !== null) {
          log(
            `User rule matched for ${resource_path}: ${user_result.allowed ? 'ALLOWED' : 'DENIED'}`
          )
          return {
            allowed: user_result.allowed,
            reason: user_result.reason
          }
        }

        log(
          `No matching user rules for ${resource_path}, continuing to public_read check`
        )
      }
    }

    // Step 4: Check public_read setting
    if (resource_metadata?.public_read?.explicit) {
      if (resource_metadata.public_read.value) {
        log(`Public read enabled for ${resource_path}`)
        return {
          allowed: true,
          reason: 'Resource has public_read explicitly enabled'
        }
      } else {
        log(`Public read disabled for ${resource_path}`)
        return {
          allowed: false,
          reason: 'Resource has public_read explicitly disabled'
        }
      }
    }

    // Step 5: Fall back to public rules
    const public_rules = await this.get_public_rules()
    const public_result = await evaluate_permission_rules({
      rules: public_rules,
      resource_path,
      user_public_key: 'public'
    })

    log(
      `Public rule result for ${resource_path}: ${public_result.allowed ? 'ALLOWED' : 'DENIED'}`
    )
    return {
      allowed: public_result.allowed,
      reason: public_result.reason
    }
  }

  /**
   * Get user's global_write permission
   *
   * @returns {Promise<boolean>} True if user has global_write permission
   */
  async get_global_write_permission() {
    if (this._global_write_checked) {
      return this._global_write ?? false
    }

    this._global_write_checked = true

    if (!this.user_public_key || this.user_public_key === 'public') {
      this._global_write = false
      return false
    }

    try {
      const user = await user_registry.find_by_public_key(this.user_public_key)
      if (user?.permissions?.global_write === true) {
        this._global_write = true
        log(`User ${this.user_public_key} has global_write permission`)
        return true
      }
      this._global_write = false
      return false
    } catch (error) {
      log(`Error checking global_write permission: ${error.message}`)
      this._global_write = false
      return false
    }
  }

  /**
   * Check write permission for a resource
   *
   * Priority order:
   * 1. Ownership (user owns the resource)
   * 2. Global write permission (user has global_write: true)
   *
   * @param {Object} params - Parameters
   * @param {string} params.resource_path - Base-URI path of the resource
   * @param {Object|null} params.metadata - Optional pre-loaded metadata
   * @returns {Promise<{allowed: boolean, reason: string}>} Permission result
   */
  async _check_write_permission({ resource_path, metadata = null }) {
    if (!this.user_public_key || this.user_public_key === 'public') {
      return {
        allowed: false,
        reason: 'Write access requires authentication'
      }
    }

    const resource_metadata =
      metadata || (await this.get_resource_metadata(resource_path))

    // Step 1: Check ownership
    if (resource_metadata?.owner_public_key === this.user_public_key) {
      return {
        allowed: true,
        reason: 'User is owner of the resource'
      }
    }

    // Step 2: Check global_write permission
    const has_global_write = await this.get_global_write_permission()
    if (has_global_write) {
      return {
        allowed: true,
        reason: 'User has global write permission'
      }
    }

    return {
      allowed: false,
      reason: 'Only resource owner has write access'
    }
  }

  /**
   * Check permissions for a resource (both read and write)
   *
   * @param {Object} params - Parameters
   * @param {string} params.resource_path - Base-URI path of the resource
   * @param {Object|null} params.metadata - Optional pre-loaded metadata
   * @param {string|null} params.share_token - Optional share token from query parameter
   * @returns {Promise<{read: {allowed: boolean, reason: string}, write: {allowed: boolean, reason: string}}>}
   */
  async check_permission({
    resource_path,
    metadata = null,
    share_token = null
  }) {
    log(
      `Checking permission for user: ${this.user_public_key || 'public'}, resource: ${resource_path}`
    )

    // Load metadata once and use for both checks
    const resource_metadata =
      metadata || (await this.get_resource_metadata(resource_path))

    const [read_result, write_result] = await Promise.all([
      this._check_read_permission({
        resource_path,
        metadata: resource_metadata,
        share_token
      }),
      this._check_write_permission({
        resource_path,
        metadata: resource_metadata
      })
    ])

    return {
      read: read_result,
      write: write_result
    }
  }

  /**
   * Clear all cached data
   */
  clear_cache() {
    this._resource_cache.clear()
    this._user_rules = null
    this._public_rules = null
    this._global_write = null
    this._global_write_checked = false
  }
}
