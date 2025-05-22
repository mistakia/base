import express from 'express'
import path from 'path'

import config from '#config'

import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'

const router = express.Router({ mergeParams: true })

router.get('/:base_relative_path(*)', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { base_relative_path } = req.params
    const { root_base_directory = config.root_base_directory } = req.query

    if (!base_relative_path) {
      return res.status(400).send({ error: 'missing base_relative_path' })
    }

    if (!root_base_directory) {
      return res.status(400).send({ error: 'missing root_base_directory' })
    }

    try {
      // Construct absolute path from base_relative_path
      const absolute_path = path.join(root_base_directory, base_relative_path)

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
        base_relative_path,
        ...entity.entity_properties,
        content: entity.entity_content
      })
    } catch (error) {
      return res.status(404).send({
        error: `Entity ${base_relative_path} not found: ${error.message}`
      })
    }
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
