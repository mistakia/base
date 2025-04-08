import express from 'express'
import debug from 'debug'
import { inference_providers } from '#libs-server'

const router = express.Router()
const log = debug('api:inference_providers')

// List all registered providers and their models
router.get('/', async (req, res) => {
  try {
    const provider_list = inference_providers.provider_registry.list()
    const result = []

    for (const provider_name of provider_list) {
      try {
        const provider = inference_providers.get_provider(provider_name)
        const models = await provider.list_models()

        result.push({
          name: provider_name,
          models
        })
      } catch (error) {
        log(`Error listing models for provider ${provider_name}:`, error)
        // Continue with other providers even if one fails
        result.push({
          name: provider_name,
          error: error.message
        })
      }
    }

    res.json(result)
  } catch (error) {
    log('Error listing inference providers:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get details for a specific provider
router.get('/:provider_name', async (req, res) => {
  try {
    const { provider_name } = req.params

    try {
      const provider = inference_providers.get_provider(provider_name)
      const models = await provider.list_models()

      res.json({
        name: provider_name,
        models
      })
    } catch (error) {
      if (error.message.includes('not found')) {
        return res
          .status(404)
          .json({ error: `Provider not found: ${provider_name}` })
      }
      throw error
    }
  } catch (error) {
    log(`Error getting provider ${req.params.provider_name}:`, error)
    res.status(500).json({ error: error.message })
  }
})

// Get details for a specific model from a provider
router.get('/:provider_name/models/:model_name', async (req, res) => {
  try {
    const { provider_name, model_name } = req.params

    try {
      const provider = inference_providers.get_provider(provider_name)
      const model_info = await provider.get_model_info({ model: model_name })

      res.json({
        provider: provider_name,
        model: model_name,
        ...model_info
      })
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: `Provider or model not found: ${provider_name}/${model_name}`
        })
      }
      throw error
    }
  } catch (error) {
    log(`Error getting model ${req.params.model_name}:`, error)
    res.status(500).json({ error: error.message })
  }
})

export default router
