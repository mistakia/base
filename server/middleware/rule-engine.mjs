import picomatch from 'picomatch'
import debug from 'debug'

import { validate_thread_ownership } from './permission/index.mjs'

const log = debug('permission:rule-engine')

/**
 * Checks if a user owns a resource based on the resource path
 *
 * @param {string} resource_path - Base-URI path of the resource
 * @param {string} user_public_key - User's public key
 * @returns {boolean} True if user owns the resource
 */
const check_resource_ownership = async (resource_path, user_public_key) => {
  if (!resource_path || !user_public_key) {
    log('Missing resource_path or user_public_key for ownership check')
    return false
  }

  // Parse the resource path to determine resource type
  const path_parts = resource_path.split(':')
  if (path_parts.length !== 2) {
    log(`Invalid resource path format: ${resource_path}`)
    return false
  }

  const [prefix, path] = path_parts

  // Handle thread resources
  if (prefix === 'user' && path.startsWith('thread/')) {
    const thread_id = path.replace('thread/', '')
    const is_owner = await validate_thread_ownership({
      thread_id,
      user_public_key
    })
    log(`Thread ownership check for ${thread_id}: ${is_owner}`)
    return is_owner
  }

  log(`Ownership check not implemented for resource type: ${prefix}:${path}`)
  return false
}

/**
 * Generates implicit parent directory patterns from a given pattern
 *
 * @param {string} pattern - Original pattern (e.g., "user:repository/active/base/**")
 * @returns {Array} Array of parent directory patterns
 */
export const generate_parent_directory_patterns = (pattern) => {
  // Skip special patterns and root patterns
  if (
    pattern === 'is_owner' ||
    pattern === '**' ||
    pattern === '**/*' ||
    !pattern.includes('/')
  ) {
    return []
  }

  const parent_patterns = []

  // Remove any trailing /** or /* to get the base path
  const base_pattern = pattern.replace(/\/\*\*?$/, '')

  // Split the path into segments
  const segments = base_pattern.split('/')

  // Generate parent patterns by building up the path
  for (let i = 1; i < segments.length; i++) {
    const parent_path = segments.slice(0, i + 1).join('/')
    parent_patterns.push(parent_path)
  }

  return parent_patterns
}

/**
 * Evaluates permission rules against a resource path for read access
 *
 * @param {Object} params - Parameters for rule evaluation
 * @param {Array} params.rules - Array of permission rules to evaluate
 * @param {string} params.resource_path - Base-URI path of the resource being accessed
 * @param {string|null} params.user_public_key - User's public key, null/undefined for public access
 * @returns {Object} Evaluation result with allowed/denied status and matching rule
 */
export const evaluate_permission_rules = async ({
  rules,
  resource_path,
  user_public_key = null
}) => {
  log(
    `Evaluating rules for path: ${resource_path}, user: ${user_public_key || 'public'}`
  )

  if (!rules || !Array.isArray(rules)) {
    log('No rules provided, defaulting to deny')
    return {
      allowed: false,
      reason: 'No permission rules configured',
      matching_rule: null
    }
  }

  // Process rules in order - first match wins
  for (const rule of rules) {
    if (!rule.pattern || !rule.action) {
      log(`Skipping invalid rule: ${JSON.stringify(rule)}`)
      continue
    }

    // Handle special ownership patterns
    if (rule.pattern === 'is_owner') {
      const is_owner = await check_resource_ownership(
        resource_path,
        user_public_key
      )
      if (is_owner) {
        log(`Rule matched ownership pattern: ${rule.pattern}`)
        return {
          allowed: rule.action === 'allow',
          reason: `${rule.action} by ownership rule: ${rule.pattern}`,
          matching_rule: rule
        }
      }
      continue
    }

    // Use picomatch for glob pattern matching
    const pattern_matcher = picomatch(rule.pattern)
    if (pattern_matcher(resource_path)) {
      log(`Rule matched pattern: ${rule.pattern} -> ${rule.action}`)
      return {
        allowed: rule.action === 'allow',
        reason: `${rule.action} by rule: ${rule.pattern}`,
        matching_rule: rule
      }
    }

    // Check implicit parent directory access for 'allow' rules only
    if (rule.action === 'allow') {
      const parent_patterns = generate_parent_directory_patterns(rule.pattern)
      for (const parent_pattern of parent_patterns) {
        if (parent_pattern === resource_path) {
          log(
            `Rule matched implicit parent directory: ${parent_pattern} (from ${rule.pattern})`
          )
          return {
            allowed: true,
            reason: `allow by implicit parent directory access: ${parent_pattern} (from rule: ${rule.pattern})`,
            matching_rule: { ...rule, pattern: parent_pattern, implicit: true }
          }
        }
      }

      // Also check if the resource_path is a parent directory that leads to this allowed pattern
      // This handles cases like checking if "user:repository" should be visible when "user:repository/active/base/**" is allowed
      const rule_base_pattern = rule.pattern.replace(/\/\*\*?$/, '')
      if (rule_base_pattern.startsWith(resource_path + '/')) {
        log(
          `Rule allows access to child pattern: ${resource_path} leads to ${rule.pattern}`
        )
        return {
          allowed: true,
          reason: `allow by parent directory navigation: ${resource_path} leads to allowed pattern ${rule.pattern}`,
          matching_rule: { ...rule, pattern: resource_path, implicit: true }
        }
      }
    }
  }

  // Default deny if no rules match
  log('No matching rules found, defaulting to deny')
  return {
    allowed: false,
    reason: 'No matching permission rules (default deny)',
    matching_rule: null
  }
}

/**
 * Validates a permission rule structure
 *
 * @param {Object} rule - Rule to validate
 * @returns {Object} Validation result with valid status and errors
 */
export const validate_permission_rule = (rule) => {
  const errors = []

  if (!rule || typeof rule !== 'object') {
    errors.push('Rule must be an object')
    return { valid: false, errors }
  }

  if (!rule.action || !['allow', 'deny'].includes(rule.action)) {
    errors.push('Rule action must be "allow" or "deny"')
  }

  if (!rule.pattern || typeof rule.pattern !== 'string') {
    errors.push('Rule pattern must be a non-empty string')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validates an array of permission rules
 *
 * @param {Array} rules - Array of rules to validate
 * @returns {Object} Validation result with valid status and detailed errors
 */
export const validate_permission_rules = (rules) => {
  if (!Array.isArray(rules)) {
    return {
      valid: false,
      errors: ['Rules must be an array'],
      rule_errors: []
    }
  }

  const rule_errors = []
  let all_valid = true

  rules.forEach((rule, index) => {
    const validation = validate_permission_rule(rule)
    if (!validation.valid) {
      all_valid = false
      rule_errors.push({
        index,
        rule,
        errors: validation.errors
      })
    }
  })

  return {
    valid: all_valid,
    errors: all_valid ? [] : ['One or more rules are invalid'],
    rule_errors
  }
}
