import express from 'express'
import {
  list_tags_from_database,
  read_tag_from_filesystem
} from '#libs-server/tag/index.mjs'
import { search_entities } from '#libs-server/entity/index.mjs'

const router = express.Router({ mergeParams: true })

// Get a list of all tags for the authenticated user
router.get('/', async (req, res) => {
  const { log } = req.app.locals
  try {
    const user_id = req.auth.user_id
    const { include_archived, search_term } = req.query

    const tags = await list_tags_from_database({
      user_id,
      include_archived: include_archived === 'true',
      search_term
    })

    res.send(tags)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

// Get a specific tag by tag base_relative_path
router.get('/:base_relative_path(*)', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { base_relative_path } = req.params
    const { root_base_directory } = req.query
    const user_id = req.auth.user_id

    try {
      // Read the tag directly from filesystem using the provided tag_base_relative_path
      const tag = await read_tag_from_filesystem({
        base_relative_path,
        root_base_directory
      })

      // Get all entities associated with this tag using base_relative_path
      const tagged_entities = await search_entities({
        user_id,
        tag_base_relative_paths: [tag.base_relative_path]
      })

      // Return both the tag and the tagged entities directly
      res.send({
        tag,
        entities: tagged_entities
      })
    } catch (error) {
      return res.status(404).send({
        error: `Tag ${base_relative_path} not found: ${error.message}`
      })
    }
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
