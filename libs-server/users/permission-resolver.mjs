import debug from 'debug'

import { load_role } from '#libs-server/users/role-loader.mjs'
import { parse_relation_entry } from '#libs-server/entity/format/extractors/relation-extractor.mjs'

const log = debug('permission-resolver')

/**
 * Extract has_role relations from identity in order
 * @param {Object} identity - Identity entity
 * @returns {Array<string>} Array of role base_uris in relation order
 */
function get_role_base_uris_from_identity(identity) {
  if (!identity?.relations || !Array.isArray(identity.relations)) {
    return []
  }

  const role_base_uris = []

  for (const relation_str of identity.relations) {
    const parsed = parse_relation_entry(relation_str)
    if (parsed && parsed.relation_type === 'has_role') {
      role_base_uris.push(parsed.base_uri)
    }
  }

  return role_base_uris
}

/**
 * Validate that a rule object has the required structure
 * @param {*} rule - Rule to validate
 * @returns {boolean} True if rule is valid
 */
function is_valid_rule(rule) {
  return rule && typeof rule === 'object' && typeof rule.action === 'string'
}

/**
 * Resolve rules from an identity by field name
 * Collects rules from the identity entity first, then from roles in relation order.
 *
 * @param {Object} params - Parameters
 * @param {Object} params.identity - Identity entity
 * @param {string} params.field - Field name on identity/role ('rules' or 'tag_rules')
 * @returns {Promise<Array>} Flat array of rules with source metadata
 */
async function resolve_identity_rules({ identity, field }) {
  if (!identity) {
    log(`No identity provided, returning empty ${field}`)
    return []
  }

  const all_rules = []

  // Step 1: Add user-specific rules first (highest priority)
  const identity_rules = identity[field]
  if (identity_rules && Array.isArray(identity_rules)) {
    log(
      `Adding ${identity_rules.length} user-specific ${field} for ${identity.username}`
    )
    for (const rule of identity_rules) {
      if (is_valid_rule(rule)) {
        all_rules.push({
          ...rule,
          source: 'identity',
          source_uri: identity.base_uri
        })
      }
    }
  }

  // Step 2: Load all roles in parallel, then add rules in order
  const role_base_uris = get_role_base_uris_from_identity(identity)

  if (role_base_uris.length > 0) {
    const role_results = await Promise.all(
      role_base_uris.map(async (base_uri) => {
        try {
          return await load_role({ base_uri })
        } catch (error) {
          log(`Error loading role ${base_uri}: ${error.message}`)
          return null
        }
      })
    )

    for (let i = 0; i < role_base_uris.length; i++) {
      const role = role_results[i]
      const role_base_uri = role_base_uris[i]
      const role_rules = role?.[field]

      if (role_rules && Array.isArray(role_rules)) {
        log(`Adding ${role_rules.length} ${field} from role ${role_base_uri}`)
        for (const rule of role_rules) {
          if (is_valid_rule(rule)) {
            all_rules.push({
              ...rule,
              source: 'role',
              source_uri: role_base_uri
            })
          }
        }
      } else if (!role) {
        log(`Role ${role_base_uri} not found`)
      }
    }
  }

  log(
    `Resolved ${all_rules.length} total ${field} for ${identity.username}`
  )
  return all_rules
}

/**
 * Resolve all permission rules for an identity
 *
 * @param {Object} params - Parameters
 * @param {Object} params.identity - Identity entity with rules and relations
 * @returns {Promise<Array>} Flat array of permission rules compatible with rule-engine
 */
export async function resolve_user_rules({ identity }) {
  return resolve_identity_rules({ identity, field: 'rules' })
}

/**
 * Resolve all tag-based permission rules for an identity
 *
 * @param {Object} params - Parameters
 * @param {Object} params.identity - Identity entity with tag_rules and relations
 * @returns {Promise<Array>} Flat array of tag rules
 */
export async function resolve_user_tag_rules({ identity }) {
  return resolve_identity_rules({ identity, field: 'tag_rules' })
}

/**
 * Get permission flags from identity
 * @param {Object} params - Parameters
 * @param {Object} params.identity - Identity entity
 * @returns {Object} Permission flags
 */
export function get_identity_permissions({ identity }) {
  const permissions = identity?.permissions || {}

  return {
    create_threads: permissions.create_threads === true,
    global_write: permissions.global_write === true
  }
}

/**
 * Convert identity entity to user object compatible with existing system
 * @param {Object} params - Parameters
 * @param {Object} params.identity - Identity entity
 * @returns {Promise<Object>} User object with permissions and rules
 */
export async function convert_identity_to_user({ identity }) {
  if (!identity) {
    return null
  }

  const rules = await resolve_user_rules({ identity })
  const permission_flags = get_identity_permissions({ identity })

  const user = {
    username: identity.username,
    created_at: identity.created_at,
    permissions: {
      ...permission_flags,
      rules
    }
  }

  if (identity.thread_config) {
    user.thread_config = identity.thread_config
  }

  if (identity.preferences) {
    user.preferences = identity.preferences
  }

  return user
}

export default {
  resolve_user_rules,
  resolve_user_tag_rules,
  get_identity_permissions,
  convert_identity_to_user
}
