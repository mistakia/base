import express from 'express'
import {
  create_tag,
  delete_tag,
  get_tag_by_name,
  get_tag_by_id,
  get_tags,
  get_tagged_entities,
  tag_entity,
  untag_entity,
  update_tag
} from '#libs-server/tags/index.mjs'

const router = express.Router({ mergeParams: true })

// Get a list of all tags for the authenticated user
router.get('/', async (req, res) => {
  const { log } = req.app.locals
  try {
    const user_id = req.auth.user_id
    const { archived, search_term } = req.query

    const tags = await get_tags({
      user_id,
      archived: archived === 'true',
      search_term
    })

    res.send(tags)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

// Create a new tag
router.post('/', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { title, description, color } = req.body
    const user_id = req.auth.user_id

    if (!title) {
      return res.status(400).send({ error: 'Tag title is required' })
    }

    // Check if tag with this name already exists
    const existing_tag = await get_tag_by_name({
      title,
      user_id
    })

    if (existing_tag) {
      return res.status(409).send({
        error: 'Tag with this name already exists',
        tag_id: existing_tag.tag_id
      })
    }

    const tag_id = await create_tag({
      title,
      description,
      user_id,
      color
    })

    const tag = await get_tag_by_id({ tag_id, user_id })
    res.status(201).send(tag)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

// Get a specific tag by name
router.get('/:tag_name', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { tag_name } = req.params
    const user_id = req.auth.user_id

    const tag = await get_tag_by_name({
      title: tag_name,
      user_id
    })

    if (!tag) {
      return res.status(404).send({ error: 'Tag not found' })
    }

    // Get all entities associated with this tag
    const tagged_entities = await get_tagged_entities({
      tag_id: tag.tag_id,
      user_id
    })

    res.send(tagged_entities)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

// Update a tag
router.put('/:tag_id', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { tag_id } = req.params
    const { title, description, color, archive } = req.body
    const user_id = req.auth.user_id

    const success = await update_tag({
      tag_id,
      user_id,
      title,
      description,
      color,
      archive
    })

    if (!success) {
      return res.status(404).send({ error: 'Tag not found' })
    }

    const updated_tag = await get_tag_by_id({ tag_id, user_id })
    res.send(updated_tag)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

// Delete a tag
router.delete('/:tag_id', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { tag_id } = req.params
    const user_id = req.auth.user_id

    const success = await delete_tag({
      tag_id,
      user_id
    })

    if (!success) {
      return res.status(404).send({ error: 'Tag not found' })
    }

    res.status(204).send()
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

// Tag an entity
router.post('/:tag_id/entities/:entity_id', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { tag_id, entity_id } = req.params
    const user_id = req.auth.user_id

    const success = await tag_entity({
      tag_id,
      entity_id,
      user_id
    })

    if (!success) {
      return res.status(404).send({ error: 'Tag or entity not found' })
    }

    res.status(204).send()
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

// Untag an entity
router.delete('/:tag_id/entities/:entity_id', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { tag_id, entity_id } = req.params
    const user_id = req.auth.user_id

    const success = await untag_entity({
      tag_id,
      entity_id,
      user_id
    })

    if (!success) {
      return res.status(404).send({ error: 'Tag or entity not found' })
    }

    res.status(204).send()
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
