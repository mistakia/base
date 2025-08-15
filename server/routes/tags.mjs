import express from 'express'
import {
  list_tags_from_filesystem,
  read_tag_from_filesystem
} from '#libs-server/tag/index.mjs'
import { search_entities } from '#libs-server/entity/index.mjs'

const router = express.Router({ mergeParams: true })

// Get a list of all tags for the authenticated user OR get a specific tag by base_uri
router.get('/', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { base_uri, include_archived, search_term } = req.query
    const user_public_key = req.user?.user_public_key
    if (!user_public_key) {
      return res.status(401).send({ error: 'authentication required' })
    }

    // If base_uri is provided, get a specific tag
    if (base_uri) {
      try {
        // Read the tag directly from filesystem using registry-based resolution
        const tag = await read_tag_from_filesystem({
          base_uri
        })

        // Get all entities associated with this tag using base_uri
        const tagged_entities = await search_entities({
          user_public_key,
          tag_base_uris: [tag.base_uri]
        })

        // Return both the tag and the tagged entities directly
        res.send({
          tag,
          entities: tagged_entities
        })
      } catch (error) {
        return res.status(404).send({
          error: `Tag ${base_uri} not found: ${error.message}`
        })
      }
    } else {
      // If no base_uri, list all tags
      const tags = await list_tags_from_filesystem({
        user_public_key,
        include_archived: include_archived === 'true',
        search_term
      })

      res.send(tags)
    }
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
