import express from 'express'
import debug from 'debug'

import { get_models_from_cache } from '#libs-server/utils/models-cache.mjs'
import { handle_errors } from '#libs-server/utils/api-error.mjs'

const router = express.Router()
const log = debug('api:models')

// Get cached models data
router.get('/', async (req, res) => {
  try {
    log('Getting models data from cache')

    const cache_data = await get_models_from_cache()

    if (!cache_data || !cache_data.models) {
      return res.status(503).json({
        error: 'Models data unavailable',
        message: 'Unable to fetch or cache models data'
      })
    }

    // Include cache metadata in response
    const response = {
      models: cache_data.models,
      metadata: {
        cached_at: cache_data.cached_at,
        expires_at: cache_data.expires_at,
        model_count: Object.keys(cache_data.models).length
      }
    }

    log(`Returning ${response.metadata.model_count} models from cache`)
    res.set('Cache-Control', 'public, max-age=3600')
    res.json(response)
  } catch (error) {
    handle_errors(res, error, 'getting models data')
  }
})

export default router
