import express from 'express'

import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'

const router = express.Router({ mergeParams: true })

router.get('/', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { base_uri } = req.query

    if (!base_uri) {
      return res.status(400).send({ error: 'missing base_uri query parameter' })
    }

    try {
      // Resolve absolute path using registry with full base_uri
      const absolute_path = resolve_base_uri_from_registry(base_uri)

      // Read entity from filesystem
      const entity = await read_entity_from_filesystem({
        absolute_path
      })

      if (!entity.success) {
        return res
          .status(404)
          .send({ error: entity.error || 'Entity not found' })
      }

      res.status(200).send({
        base_uri,
        ...entity.entity_properties,
        content: entity.entity_content
      })
    } catch (error) {
      return res.status(404).send({
        error: `Entity ${base_uri} not found: ${error.message}`
      })
    }
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
