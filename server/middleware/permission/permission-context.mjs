import debug from 'debug'

import user_registry from '#libs-server/users/user-registry.mjs'
import { evaluate_permission_rules } from '#server/middleware/rule-engine.mjs'
import { load_resource_metadata } from './resource-metadata.mjs'

const log = debug('permission:context')

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
    this._user_rules_loaded = false
    this._public_rules_loaded = false
  }

  /**
   * Get resource metadata with caching
   *
   * @param {string} resource_path - Base-URI path of the resource
   * @returns {Promise<Object|null>} Resource metadata or null
   */
  async get_resource_metadata(resource_path) {
    if (this._resource_cache.has(resource_path)) {
      log(`Cache hit for resource metadata: ${resource_path}`)
      return this._resource_cache.get(resource_path)
    }

    log(`Cache miss for resource metadata: ${resource_path}`)
    const metadata = await load_resource_metadata({ resource_path })
    this._resource_cache.set(resource_path, metadata)
    return metadata
  }

  /**
   * Get user permission rules with lazy loading
   *
   * @returns {Promise<Array>} Array of permission rules
   */
  async get_user_rules() {
    if (this._user_rules_loaded) {
      return this._user_rules || []
    }

    this._user_rules_loaded = true

    if (!this.user_public_key || this.user_public_key === 'public') {
      this._user_rules = []
      return this._user_rules
    }

    try {
      const user = await user_registry.find_by_public_key(this.user_public_key)
      if (user?.permissions?.rules && Array.isArray(user.permissions.rules)) {
        this._user_rules = user.permissions.rules
        log(
          `Loaded ${this._user_rules.length} rules for user ${this.user_public_key}`
        )
      } else {
        this._user_rules = []
        log(`No permission rules found for user: ${this.user_public_key}`)
      }
    } catch (error) {
      log(`Error loading user rules: ${error.message}`)
      this._user_rules = []
    }

    return this._user_rules
  }

  /**
   * Get public user permission rules with lazy loading
   *
   * @returns {Promise<Array>} Array of public permission rules
   */
  async get_public_rules() {
    if (this._public_rules_loaded) {
      return this._public_rules || []
    }

    this._public_rules_loaded = true

    try {
      const public_user = await user_registry.find_by_public_key('public')
      if (
        public_user?.permissions?.rules &&
        Array.isArray(public_user.permissions.rules)
      ) {
        this._public_rules = public_user.permissions.rules
        log(`Loaded ${this._public_rules.length} public rules`)
      } else {
        this._public_rules = []
        log('No public permission rules found')
      }
    } catch (error) {
      log(`Error loading public rules: ${error.message}`)
      this._public_rules = []
    }

    return this._public_rules
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
   * @returns {Promise<{allowed: boolean, reason: string}>} Permission result
   */
  async _check_read_permission({ resource_path, metadata = null }) {
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

    // Step 2: Check user-specific rules (authenticated users only)
    if (this.user_public_key && this.user_public_key !== 'public') {
      const user_rules = await this.get_user_rules()

      if (user_rules.length > 0) {
        const user_result = await evaluate_permission_rules({
          rules: user_rules,
          resource_path,
          user_public_key: this.user_public_key
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

    // Step 3: Check public_read setting
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

    // Step 4: Fall back to public rules
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
   * Check write permission for a resource
   *
   * Write access is limited to resource owners only.
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

    if (resource_metadata?.owner_public_key === this.user_public_key) {
      return {
        allowed: true,
        reason: 'User is owner of the resource'
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
   * @returns {Promise<{read: {allowed: boolean, reason: string}, write: {allowed: boolean, reason: string}}>}
   */
  async check_permission({ resource_path, metadata = null }) {
    log(
      `Checking permission for user: ${this.user_public_key || 'public'}, resource: ${resource_path}`
    )

    // Load metadata once and use for both checks
    const resource_metadata =
      metadata || (await this.get_resource_metadata(resource_path))

    const [read_result, write_result] = await Promise.all([
      this._check_read_permission({
        resource_path,
        metadata: resource_metadata
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
    this._user_rules_loaded = false
    this._public_rules_loaded = false
  }
}
