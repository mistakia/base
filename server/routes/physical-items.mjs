import express from 'express'
import { process_physical_item_table_request } from '#libs-server/physical-items/process-physical-item-table-request.mjs'

const router = express.Router({ mergeParams: true })

// POST /api/physical-items/table - Server-side table processing
router.post('/table', async (req, res) => {
  const { log } = req.app.locals

  try {
    const { table_state } = req.body

    if (table_state && typeof table_state !== 'object') {
      return res.status(400).json({
        error: 'Invalid table_state',
        message: 'table_state must be an object matching react-table schema'
      })
    }

    const user_public_key = req.user?.user_public_key || null

    const results = await process_physical_item_table_request({
      table_state: table_state || {},
      requesting_user_public_key: user_public_key
    })

    log(
      `Physical items table request processed: ${results.rows.length}/${results.total_row_count} items`
    )

    res.status(200).json(results)
  } catch (error) {
    log('Error processing physical items table request:', error)
    res.status(500).json({
      error: 'Failed to process physical items table request',
      message: error.message
    })
  }
})

export default router
