import { promises as fs } from 'fs'
import path from 'path'
import debug from 'debug'

import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'

const log = debug('content-review:config')

const DEFAULT_CONFIG = {
  default_model: 'ollama/devstral-small-2:24b',
  max_content_size: 32000,
  timeout_ms: 180000,
  tier_classifier: {
    backend: 'ollama',
    model: 'ollama/devstral-small-2:24b',
    endpoint: 'http://127.0.0.1:11434',
    max_tokens: 2048
  },
  guidelines: [
    'sys:system/guideline/review-for-personal-information.md',
    'sys:system/guideline/review-for-secret-information.md'
  ],
  tier_definitions: {
    public:
      'Safe for unauthenticated public access. Contains no personal information, secrets, or sensitive infrastructure details. Includes technical documentation, open-source project work, generic design preferences, and publicly shareable methodology.',
    acquaintance:
      'Contains personal context appropriate for known contacts but not the general public. Includes personal project plans, lifestyle documentation, belongings inventory, hobby details, and personal workflows. Does NOT contain PII (addresses, phone numbers, financial records) or infrastructure secrets.',
    private:
      'Contains personal information, secrets, credentials, infrastructure details, or other sensitive content that must remain restricted. Includes PII, financial records, property addresses, network topology, authentication credentials, and insurance/legal documents.'
  },
  guidance_notes: [],
  exclude_patterns: [],
  forced_private_patterns: [],
  privacy_filter: {
    enabled: false,
    score_threshold: 0.85,
    label_floor: {
      secret: 'private',
      account_number: 'private',
      private_address: 'private',
      private_email: 'private',
      private_phone: 'private'
    }
  }
}

let cached_config = null

/**
 * Load content review configuration from user base directory.
 * Merges user overlay from config/content-review-config.json over defaults.
 *
 * @returns {Promise<Object>} Review configuration merged with defaults
 */
export async function load_review_config() {
  if (cached_config) {
    return cached_config
  }

  let user_base_dir
  try {
    user_base_dir = get_user_base_directory()
  } catch {
    log('No user base directory configured, using defaults')
    cached_config = DEFAULT_CONFIG
    return cached_config
  }

  const config_path = path.join(
    user_base_dir,
    'config',
    'content-review-config.json'
  )

  try {
    const config_content = await fs.readFile(config_path, 'utf-8')
    const user_config = JSON.parse(config_content)

    // Deep merge user config with defaults (arrays replaced, not concatenated)
    cached_config = deep_merge(DEFAULT_CONFIG, user_config)
    log(`Loaded review config from ${config_path}`)
  } catch (error) {
    if (error.code === 'ENOENT') {
      log(`No review config found at ${config_path}, using defaults`)
    } else {
      log(`Error loading review config: ${error.message}, using defaults`)
    }
    cached_config = DEFAULT_CONFIG
  }

  return cached_config
}

/**
 * Clear cached configuration (useful for testing or config reload)
 */
export function clear_review_config_cache() {
  cached_config = null
}

/**
 * Deep merge two objects. Arrays are replaced, not concatenated.
 *
 * @param {Object} target - Target object
 * @param {Object} source - Source object to merge
 * @returns {Object} Merged object
 */
function deep_merge(target, source) {
  const result = { ...target }

  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = deep_merge(result[key] || {}, source[key])
    } else {
      result[key] = source[key]
    }
  }

  return result
}

export { DEFAULT_CONFIG }
