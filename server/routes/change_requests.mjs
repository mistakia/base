import express from 'express'
import {
  create_change_request,
  get_change_request,
  list_change_requests,
  update_change_request_status,
  merge_change_request
} from '#libs-server/change_requests/index.mjs'

const router = express.Router()

// GET /api/change-requests - List change requests with filtering
router.get('/', async (req, res) => {
  const { log } = req.app.locals
  try {
    const {
      status,
      creator_id,
      target_branch,
      search,
      tags,
      include_closed,
      limit = '100',
      offset = '0',
      sort_by = 'updated_at',
      sort_order = 'desc'
    } = req.query

    // Parse tags from comma-separated string if present
    const parsed_tags = tags ? tags.split(',') : undefined

    const change_requests = await list_change_requests({
      status,
      creator_id,
      target_branch,
      search,
      tags: parsed_tags,
      include_closed: include_closed === 'true',
      limit: parseInt(limit),
      offset: parseInt(offset),
      sort_by,
      sort_order
    })

    res.status(200).json(change_requests)
  } catch (error) {
    log(error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/change-requests/:id - Get single change request
router.get('/:id', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({ error: 'missing change request id' })
    }

    const change_request = await get_change_request({
      change_request_id: id
    })

    if (!change_request) {
      return res.status(404).json({ error: 'change request not found' })
    }

    res.status(200).json(change_request)
  } catch (error) {
    log(error)
    res.status(500).json({ error: error.message })
  }
})

// POST /api/change-requests - Create new change request
router.post('/', async (req, res) => {
  const { log } = req.app.locals
  try {
    const {
      title,
      description,
      target_branch,
      file_changes = [],
      tags = [],
      create_github_pr,
      github_repo
    } = req.body

    // Validate required fields
    if (!title || !target_branch) {
      return res.status(400).json({
        error: 'missing required fields: title and target_branch'
      })
    }

    const change_request_id = await create_change_request({
      title,
      description,
      creator_id: req.auth.user_id,
      target_branch,
      file_changes,
      tags,
      create_github_pr,
      github_repo
    })

    // Get full change request object to return
    const created_cr = await get_change_request({ change_request_id })
    res.status(201).json(created_cr)
  } catch (error) {
    log(error)
    res.status(500).json({ error: error.message })
  }
})

// PATCH /api/change-requests/:id/status - Update change request status
router.patch('/:id/status', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { id } = req.params
    const { status, comment } = req.body

    if (!status) {
      return res.status(400).json({ error: 'missing status' })
    }

    const updated_cr = await update_change_request_status({
      change_request_id: id,
      status,
      updater_id: req.auth.user_id,
      comment
    })

    res.status(200).json(updated_cr)
  } catch (error) {
    log(error)
    if (
      error.message.includes('Invalid status') ||
      error.message.includes('Cannot transition')
    ) {
      return res.status(400).json({ error: error.message })
    }
    res.status(500).json({ error: error.message })
  }
})

// POST /api/change-requests/:id/merge - Merge a change request
router.post('/:id/merge', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { id } = req.params
    const { merge_message = '', delete_branch = true } = req.body || {}

    const merged_cr = await merge_change_request({
      change_request_id: id,
      merger_id: req.auth.user_id,
      merge_message,
      delete_branch
    })

    res.status(200).json(merged_cr)
  } catch (error) {
    log(error)
    if (
      error.message.includes('already merged') ||
      error.message.includes('Cannot merge')
    ) {
      return res.status(400).json({ error: error.message })
    }
    res.status(500).json({ error: error.message })
  }
})

export default router
