import fs from 'fs/promises'
import debug from 'debug'
import { execute_shell_command } from './execute-shell-command.mjs'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'

const log = debug('models-cache')

const MODELS_API_URL = 'https://models.dev/api.json'
const CACHE_FILE_PATH = '/tmp/models-cache.json'
const CACHE_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * Transform raw models.dev API data into normalized structure for client consumption
 */
function normalize_models_data(raw_data) {
  const models = {}

  Object.entries(raw_data).forEach(([provider_id, provider_data]) => {
    if (!provider_data.models) return

    Object.entries(provider_data.models).forEach(([model_id, model_data]) => {
      const normalized_model = {
        id: model_id,
        name: model_data.name || model_id,
        provider: provider_id,
        provider_name: provider_data.name || provider_id,

        // Pricing (convert from per-1M tokens to per-token)
        pricing: {
          input_cost_per_token: (model_data.cost?.input || 0) / 1000000,
          output_cost_per_token: (model_data.cost?.output || 0) / 1000000,
          cache_read_cost_per_token: model_data.cost?.cache_read
            ? model_data.cost.cache_read / 1000000
            : null,
          cache_write_cost_per_token: model_data.cost?.cache_write
            ? model_data.cost.cache_write / 1000000
            : null,
          currency: 'USD',
          free_tier:
            (model_data.cost?.input || 0) === 0 &&
            (model_data.cost?.output || 0) === 0
        },

        // Capabilities
        capabilities: {
          multimodal:
            model_data.modalities?.input?.includes('image') ||
            model_data.modalities?.input?.includes('audio') ||
            model_data.modalities?.input?.includes('video'),
          function_calling: model_data.tool_call || false,
          reasoning: model_data.reasoning || false,
          attachments: model_data.attachment || false
        },

        // Limits
        limits: {
          context_tokens: model_data.limit?.context || null,
          output_tokens: model_data.limit?.output || null
        },

        // Metadata
        metadata: {
          knowledge_cutoff: model_data.knowledge || null,
          release_date: model_data.release_date || null,
          last_updated: model_data.last_updated || null,
          open_source: model_data.open_weights || false
        }
      }

      models[`${provider_id}:${model_id}`] = normalized_model
    })
  })

  return models
}

/**
 * Fetch models data from models.dev API
 */
async function fetch_models_from_api() {
  try {
    log('Fetching models data from API...')
    const { stdout } = await execute_shell_command(
      `curl -s "${MODELS_API_URL}"`
    )

    if (!stdout) {
      throw new Error('Empty response from models API')
    }

    const raw_data = JSON.parse(stdout)
    const normalized_data = normalize_models_data(raw_data)

    log(`Successfully fetched ${Object.keys(normalized_data).length} models`)
    return normalized_data
  } catch (error) {
    log(`Error fetching models from API: ${error.message}`)
    throw new Error(`Failed to fetch models data: ${error.message}`)
  }
}

/**
 * Read cache file if it exists
 */
async function read_cache_file() {
  try {
    const cache_exists = await file_exists_in_filesystem({
      absolute_path: CACHE_FILE_PATH
    })

    if (!cache_exists) {
      log('Cache file does not exist')
      return null
    }

    const cache_content = await fs.readFile(CACHE_FILE_PATH, 'utf8')
    const cache_data = JSON.parse(cache_content)

    log(`Cache file read successfully. Cached at: ${cache_data.cached_at}`)
    return cache_data
  } catch (error) {
    log(`Error reading cache file: ${error.message}`)
    return null
  }
}

/**
 * Write cache file with models data
 */
async function write_cache_file(models_data) {
  try {
    const now = new Date().toISOString()
    const expires_at = new Date(Date.now() + CACHE_DURATION_MS).toISOString()

    const cache_data = {
      cached_at: now,
      expires_at,
      models: models_data
    }

    await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(cache_data, null, 2))
    log(`Cache file written successfully. Expires at: ${expires_at}`)

    return cache_data
  } catch (error) {
    log(`Error writing cache file: ${error.message}`)
    throw new Error(`Failed to write cache file: ${error.message}`)
  }
}

/**
 * Check if cache is expired
 */
function is_cache_expired(cache_data) {
  if (!cache_data?.expires_at) {
    return true
  }

  const expires_at = new Date(cache_data.expires_at)
  const now = new Date()

  return now > expires_at
}

/**
 * Refresh models cache with fresh data from API
 */
export async function refresh_models_cache() {
  try {
    log('Refreshing models cache...')
    const models_data = await fetch_models_from_api()
    const cache_data = await write_cache_file(models_data)

    log('Models cache refreshed successfully')
    return cache_data
  } catch (error) {
    log(`Error refreshing models cache: ${error.message}`)
    throw error
  }
}

/**
 * Get models from cache, refresh if needed
 */
export async function get_models_from_cache() {
  try {
    let cache_data = await read_cache_file()

    // If cache doesn't exist or is expired, refresh it
    if (!cache_data || is_cache_expired(cache_data)) {
      log('Cache is missing or expired, refreshing...')
      try {
        cache_data = await refresh_models_cache()
      } catch (refresh_error) {
        // If refresh fails and we have stale cache, use it
        if (cache_data) {
          log('Using stale cache due to refresh failure')
          return cache_data
        }
        throw refresh_error
      }
    } else {
      log('Using cached models data')
    }

    return cache_data
  } catch (error) {
    log(`Error getting models from cache: ${error.message}`)
    throw error
  }
}

/**
 * Validate cache age and return true if refresh is needed
 */
export function validate_cache_age(cache_data) {
  if (!cache_data) {
    return { needs_refresh: true, reason: 'Cache does not exist' }
  }

  if (is_cache_expired(cache_data)) {
    return { needs_refresh: true, reason: 'Cache has expired' }
  }

  const cached_at = new Date(cache_data.cached_at)
  const age = Date.now() - cached_at.getTime()
  const age_days = Math.floor(age / (24 * 60 * 60 * 1000))

  return {
    needs_refresh: false,
    age: age_days,
    cached_at: cache_data.cached_at,
    expires_at: cache_data.expires_at
  }
}
